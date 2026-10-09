import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from model_policy import apply_policy, load_policy, read_agent, validate_policy


class ModelPolicyTests(unittest.TestCase):
    def install(self, target, variant):
        result = subprocess.run(
            ['bash', str(ROOT / 'install.sh'), str(target), variant],
            text=True, capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def check(self, target, passes=True):
        result = subprocess.run(
            [sys.executable, str(target / 'scripts/check-harness.py')],
            cwd=target, text=True, capture_output=True,
        )
        if passes:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('model/reasoning policy', result.stdout)

    def test_all_variants_install_and_validate(self):
        cases = {
            'normal': ('openrouter/openai/gpt-6-luna', {'effort': 'low'}),
            'cheap': ('openrouter/inclusionai/ling-3.0-flash', {'enabled': False}),
            'local': ('llamacpp/nemotron', None),
        }
        for variant, (model, reasoning) in cases.items():
            with self.subTest(variant=variant), tempfile.TemporaryDirectory() as directory:
                target = Path(directory)
                self.install(target, variant)
                self.check(target)
                header, _ = read_agent(target / '.opencode/agents/worker.md')
                self.assertEqual(header['model'], model)
                self.assertEqual(header.get('options', {}).get('reasoning'), reasoning)
                for source in (ROOT / 'agents').glob('*.md'):
                    _, source_body = read_agent(source)
                    _, installed_body = read_agent(target / '.opencode/agents' / source.name)
                    self.assertEqual(installed_body, source_body)
                result = subprocess.run(
                    [sys.executable, str(target / 'scripts/eval-report.py')],
                    cwd=target, capture_output=True, text=True,
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_normal_role_assignments_and_escalation_budgets(self):
        policy = load_policy(ROOT / 'model-policy.json')
        for role in ('researcher', 'product-analyst', 'system-analyst'):
            self.assertEqual(policy['agents'][role], 'openrouter/openai/gpt-6-luna')
            self.assertEqual(policy['reasoning'][role], {'effort': 'medium'})
        for role in ('orchestrator', 'implementer', 'test-engineer', 'requirements-reviewer', 'security-reviewer'):
            self.assertEqual(policy['agents'][role], 'openrouter/deepseek/deepseek-v4.1-flash')
            self.assertEqual(policy['reasoning'][role], {'effort': 'high'})
        self.assertEqual(policy['agents']['reviewer'], 'openrouter/z-ai/glm-5.3-flash')
        for role, effort in (('architect', 'high'), ('oracle', 'xhigh')):
            self.assertEqual(policy['agents'][role], 'openrouter/openai/gpt-6.1-sol')
            self.assertEqual(policy['reasoning'][role], {'effort': effort})
        cheap = load_policy(ROOT / 'model-policy.cheap.json')
        self.assertEqual(cheap['reasoning']['architect'], {'effort': 'medium'})
        self.assertEqual(cheap['reasoning']['oracle'], {'effort': 'high'})

    def test_variant_switching_is_repeatable_and_preserves_project_state(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            prefix = '# Project instructions\nKeep this content.\n'
            (target / 'AGENTS.md').write_text(prefix)
            (target / 'docs/agent').mkdir(parents=True)
            (target / 'docs/agent/README.md').write_text('Project map\n')
            self.install(target, 'normal')
            state = target / '.opencode-evals/codeburn-state.json'
            state.write_text('{"last_run":"2026-10-01T00:00:00Z","interval_days":14}\n')
            journal = target / '.opencode-evals/runs.jsonl'
            journal.write_text('{"outcome":"PASS","agents":["worker"],"retries":0}\n')
            original_state, original_journal = state.read_bytes(), journal.read_bytes()
            for variant in ('cheap', 'local', 'normal'):
                self.install(target, variant)
                self.check(target)
                headers = [read_agent(p)[0] for p in (target / '.opencode/agents').glob('*.md')]
                if variant == 'local':
                    self.assertTrue(all('reasoning' not in h.get('options', {}) for h in headers))
                before = {str(p.relative_to(target)): p.read_bytes() for p in target.rglob('*')
                          if p.is_file() and '__pycache__' not in p.parts}
                self.install(target, variant)
                after = {str(p.relative_to(target)): p.read_bytes() for p in target.rglob('*')
                         if p.is_file() and '__pycache__' not in p.parts}
                self.assertEqual(before, after)
                self.assertTrue((target / 'AGENTS.md').read_text().startswith(prefix))
                self.assertEqual((target / 'AGENTS.md').read_text().count('<!-- opencode-agents:begin -->'), 1)
                self.assertEqual((target / 'docs/agent/README.md').read_text(), 'Project map\n')
                self.assertEqual(state.read_bytes(), original_state)
                self.assertEqual(journal.read_bytes(), original_journal)

    def test_apply_removes_stale_overrides_preserving_unrelated_options(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            policy = load_policy(ROOT / 'model-policy.json')
            for role in policy['agents']:
                shutil.copy2(ROOT / 'agents' / (role + '.md'), target / (role + '.md'))
            path = target / 'worker.md'
            body = '\nInstructions with --- inside them stay intact.\n'
            path.write_text('---\nmodel: old/model\nvariant: high\nreasoningEffort: high\n'
                            'temperature: 0.2\noptions:\n  custom: keep\n  temperature: 0.3\n'
                            '  reasoningEffort: high\n  reasoning:\n    enabled: true\n---\n' + body)
            apply_policy(target, policy)
            header, new_body = read_agent(path)
            self.assertEqual(new_body, body)
            self.assertEqual(header['options'], {'custom': 'keep', 'reasoning': {'effort': 'low'}})
            self.assertNotIn('variant', header)
            self.assertNotIn('reasoningEffort', header)
            self.assertNotIn('temperature', header)
            self.assertEqual(apply_policy(target, policy), 0)
            local = load_policy(ROOT / 'model-policy.local.json')
            apply_policy(target, local)
            header, _ = read_agent(path)
            self.assertEqual(header['options'], {'custom': 'keep'})

    def test_unsupported_provider_settings_and_malformed_policy_fail(self):
        cases = [
            ('model-policy.json', 'implementer', {'effort': 'medium'}),
            ('model-policy.json', 'reviewer', {'effort': 'medium'}),
            ('model-policy.json', 'architect', {'enabled': True}),
            ('model-policy.cheap.json', 'worker', {'effort': 'high'}),
            ('model-policy.cheap.json', 'oracle', {'effort': 'xhigh'}),
            ('model-policy.cheap.json', 'worker', {'enabled': 'yes'}),
            ('model-policy.local.json', 'worker', {'effort': 'high'}),
        ]
        for filename, role, setting in cases:
            with self.subTest(filename=filename, role=role):
                policy = load_policy(ROOT / filename)
                policy['reasoning'][role] = setting
                self.assertTrue(validate_policy(policy))
        self.assertTrue(validate_policy([]))
        policy = load_policy(ROOT / 'model-policy.json')
        del policy['reasoning']['worker']
        self.assertTrue(validate_policy(policy))
        policy = load_policy(ROOT / 'model-policy.json')
        policy['models'][policy['agents']['worker']]['efforts'] = [[], 'high']
        self.assertTrue(validate_policy(policy))

    def test_gate_detects_reasoning_and_temperature_drift(self):
        for old, new in [('effort: low', 'effort: high'),
                         ('model: openrouter/openai/gpt-6-luna', 'model: openrouter/openai/gpt-6-luna\ntemperature: 0.1')]:
            with self.subTest(change=new), tempfile.TemporaryDirectory() as directory:
                target = Path(directory)
                self.install(target, 'normal')
                path = target / '.opencode/agents/worker.md'
                self.assertIn(old, path.read_text())
                path.write_text(path.read_text().replace(old, new))
                self.check(target, passes=False)

    def test_invalid_policy_rejected_before_installation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'kit'
            shutil.copytree(ROOT, source, ignore=shutil.ignore_patterns('.git', '__pycache__'))
            target = root / 'project'
            target.mkdir()
            (target / 'AGENTS.md').write_text('Keep me\n')
            policy_path = source / 'model-policy.json'
            policy = json.loads(policy_path.read_text())
            policy['reasoning']['implementer'] = {'effort': 'medium'}
            policy_path.write_text(json.dumps(policy))
            result = subprocess.run(['bash', str(source / 'install.sh'), str(target)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(list(target.iterdir()), [target / 'AGENTS.md'])
            self.assertEqual((target / 'AGENTS.md').read_text(), 'Keep me\n')

    def test_missing_agent_rejected_without_partial_application(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            path = target / 'worker.md'
            path.write_text('---\nmodel: old/model\n---\nKeep me\n')
            before = path.read_bytes()
            with self.assertRaisesRegex(ValueError, 'missing agents'):
                apply_policy(target, load_policy(ROOT / 'model-policy.json'))
            self.assertEqual(path.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
