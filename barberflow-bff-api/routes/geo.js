'use strict';

const { Router } = require('express');

// =============================================================
// routes/geo.js — Rotas do bounded context de geolocalização.
//
// Montado em /api/v1/geo via app.js.
//
// Dependências injetadas via Awilix middleware (req.container).
// =============================================================

const geoRouter = Router();

// Helpers para extrair deps do container Awilix
function useCase(req, name) {
  return req.container.resolve(name);
}

// -----------------------------------------------------------
// PATCH /location  — atualiza localização do usuário
// Protegido por geoRateLimit (injetado via container)
// -----------------------------------------------------------
geoRouter.patch('/location', async (req, res, next) => {
  try {
    const rateLimiter = req.container.resolve('geoRateLimiter');
    await rateLimiter.middleware()(req, res, async () => {
      const uc     = useCase(req, 'updateUserLocationUseCase');
      const { userId, lat, lng } = req.body ?? {};

      const result = await uc.execute({
        userId,
        lat: typeof lat === 'string' ? Number(lat) : lat,
        lng: typeof lng === 'string' ? Number(lng) : lng,
      });

      if (result.isFail()) return res.status(400).json({ error: result.getError() });
      return res.status(200).json(result.getValue());
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------
// GET /nearby — barbearias próximas
// Query: lat, lng, radiusKm, limit
// -----------------------------------------------------------
geoRouter.get('/nearby', async (req, res, next) => {
  try {
    const uc = useCase(req, 'getNearbyPlacesUseCase');
    const { lat, lng, radiusKm, limit } = req.query ?? {};

    const result = await uc.execute({
      lat:      Number(lat),
      lng:      Number(lng),
      radiusKm: Number(radiusKm),
      limit:    limit != null ? Number(limit) : undefined,
    });

    if (result.isFail()) return res.status(400).json({ error: result.getError() });
    return res.status(200).json({ places: result.getValue() });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------
// GET /reverse — geocoding reverso
// Query: lat, lng
// -----------------------------------------------------------
geoRouter.get('/reverse', async (req, res, next) => {
  try {
    const uc = useCase(req, 'reverseGeocodeUseCase');
    const { lat, lng } = req.query ?? {};

    const result = await uc.execute({ lat: Number(lat), lng: Number(lng) });

    if (result.isFail()) return res.status(400).json({ error: result.getError() });
    return res.status(200).json({ address: result.getValue() });
  } catch (err) {
    next(err);
  }
});

module.exports = geoRouter;
