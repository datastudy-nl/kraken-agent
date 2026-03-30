import { Hono } from "hono";

export const modelsRouter = new Hono();

const AVAILABLE_MODELS = [
  { id: "kraken-omni-2.7", owned_by: "kraken" },
  { id: "kraken-omni-2.7m", owned_by: "kraken" },
  { id: "kraken-omni-2.7n", owned_by: "kraken" },
];

// GET /v1/models
modelsRouter.get("/", (c) => {
  const models = AVAILABLE_MODELS.map((m) => ({
    id: m.id,
    object: "model",
    created: 1700000000,
    owned_by: m.owned_by,
  }));

  return c.json({
    object: "list",
    data: models,
  });
});

// GET /v1/models/:model
modelsRouter.get("/:model", (c) => {
  const modelId = c.req.param("model");
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);

  if (!model) {
    return c.json(
      {
        error: {
          message: `The model '${modelId}' does not exist`,
          type: "invalid_request_error",
          code: "model_not_found",
        },
      },
      404,
    );
  }

  return c.json({
    id: model.id,
    object: "model",
    created: 1700000000,
    owned_by: model.owned_by,
  });
});
