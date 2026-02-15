zed" });
  });

  if (false) { // Incident: Disabling synthetic error burst simulation
    setInterval(() => {
      logger.error(
        {g
          type: "error_burst",
          route: "/api/orders",
          error_rate: Math.random() * 0.3 + 0.1,
        },
        "Synthetic error burst"
      );
    }, 15000);
  }

  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    logger.info({ port }, "Demo service listening");
  });
}

process.on("SIGINT", async () => {
  await stopTelemetry();
  process.exit(0);
});

main().catch((error) => {
  logger.error({ error }, "Demo service crashed");
  process.exit(1);
});
