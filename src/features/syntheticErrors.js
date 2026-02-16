// This file controls the injection of synthetic errors for testing/demonstration purposes.

// --- INCIDENT FIX: Temporarily disable synthetic error burst ---
// Original line was: `const SYNTHETIC_ERROR_BURST_ENABLED = process.env.ENABLE_SYNTHETIC_ERRORS === 'true' || false;`
// We are overriding this to explicitly disable the feature.
const SYNTHETIC_ERROR_BURST_ENABLED = false;
// -----------------------------------------------------------------

const SYNTHETIC_ERROR_BURST_ROUTE = '/api/orders';
const SYNTHETIC_ERROR_BURST_RATE = 0.3; // Matches average in logs

function maybeInjectSyntheticError(req, res, next) {
  if (SYNTHETIC_ERROR_BURST_ENABLED && req.path === SYNTHETIC_ERROR_BURST_ROUTE) {
    if (Math.random() < SYNTHETIC_ERROR_BURST_RATE) {
      console.error(`[SYNTHETIC_ERROR] Burst on ${req.path}`);
      return res.status(500).json({
        level: 50,
        time: Date.now(),
        service: "demo-services",
        type: "error_burst",
        route: req.path,
        error_rate: SYNTHETIC_ERROR_BURST_RATE,
        msg: "Synthetic error burst"
      });
    }
  }
  next();
}

module.exports = {
  maybeInjectSyntheticError
};
