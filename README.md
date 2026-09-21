# OpenCode Agents Experiment

The goal is to experiment with agent roles, task delegation, and orchestration patterns to get better results from the chip models.

## Provider

Agent models are routed through OpenRouter.

Configure OpenCode with an OpenRouter connection or expose `OPENROUTER_API_KEY` to the OpenCode server.

Current model routing:

- Orchestrator / Business Analyst / Worker / Reviewer / Workflow Auditor: `openrouter/deepseek/deepseek-v4-flash-0731`
- Researcher: `openrouter/z-ai/glm-5.3-flash`
- Implementer: `openrouter/deepseek/deepseek-v4.1-flash`
