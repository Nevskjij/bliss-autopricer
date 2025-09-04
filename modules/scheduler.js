function scheduleTasks({
  updateExternalPricelist,
  calculateAndEmitPrices,
  cleanupOldKeyPrices,
  checkKeyPriceStability,
  updateMovingAverages,
  monitorArbitrage,
  db,
  pgp,
}) {
  setInterval(updateExternalPricelist, 30 * 60 * 1000); // Every 30 minutes
  setInterval(calculateAndEmitPrices, 15 * 60 * 1000); // Every 15 minutes
  setInterval(() => cleanupOldKeyPrices(db), 30 * 60 * 1000); // Every 30 minutes
  setInterval(checkKeyPriceStability, 30 * 60 * 1000); // Every 30 minutes
  setInterval(() => updateMovingAverages(db, pgp), 15 * 60 * 1000); // Every 15 minutes

  // Enhanced monitoring tasks
  if (monitorArbitrage) {
    setInterval(monitorArbitrage, 30 * 60 * 1000); // Every 30 minutes
    console.log('🔍 Arbitrage monitoring enabled - checking every 30 minutes');
  }
}

module.exports = scheduleTasks;
