# Flujo Langflow: SDOH Assistant

`sdoh_assistant.json` es el flujo que usa el chatbot de la app cuando `AI_PROVIDER=langflow`.

```
Chat Input ─┐
            ├─> Prompt Template ─> Language Model (OpenAI gpt-4o-mini) ─> Chat Output
Message History (por session_id) ─┘
```

- El backend (`backend/app/services/ai_service.py`) llama a `POST /api/v1/run/sdoh-assistant`
  y rellena dos variables del prompt vía *tweaks* (únicos campos editables por API):
  - `sdoh_context`: descripción del sistema y del dataset (CDC PLACES 2025) + agregados de la BD:
    cobertura, estadísticas por indicador y county, distribución de riesgo de equidad, top tracts
    vulnerables, hospitales/catchments y alertas abiertas (`build_sdoh_context`).
  - `language`: `Spanish` / `English` según el idioma de la UI.
- `session_id` = `user-<id>-<uuid del chat>`: da memoria por conversación; "Limpiar chat" abre una nueva.
- La API key de OpenAI se lee de la variable global `OPENAI_API_KEY` de Langflow (no está en el JSON).

## Puesta en marcha

1. Levantar Langflow en local (puerto 7860).
2. En Langflow: **Settings → Global Variables** → crear `OPENAI_API_KEY` (tipo Credential).
3. Importar `sdoh_assistant.json` (**New Flow → Import**). El endpoint queda como `sdoh-assistant`.
4. **Settings → Langflow API Keys** → crear una key.
5. En `.env` de la raíz:
   ```
   AI_PROVIDER=langflow
   LANGFLOW_BASE_URL=http://host.docker.internal:7860   # backend en Docker; fuera de Docker: http://localhost:7860
   LANGFLOW_FLOW_ID=sdoh-assistant
   LANGFLOW_API_KEY=sk-...
   ```
6. `docker compose up -d backend`

Si editas el flujo en la UI de Langflow, vuelve a exportarlo aquí para versionarlo.
No renombres el componente "Prompt Template": el backend lo busca por ese nombre (o ajusta `LANGFLOW_PROMPT_NODE`).
En el Playground de Langflow `sdoh_context` vale `(none)` (no pasa por el backend), así que
ahí la IA no ve la BD; pruébalo desde la app.

Con `AI_PROVIDER=openai` el backend vuelve a llamar a OpenAI directamente.
