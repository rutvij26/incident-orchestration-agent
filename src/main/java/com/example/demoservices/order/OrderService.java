package com.example.demoservices.order;

import org.springframework.stereotype.Service;
import java.util.Random;

@Service
public class OrderService {

    private static final Random random = new Random();
    // Incident: error_burst on /api/orders due to synthetic errors. Temporarily disabling this feature in production.
    private static final boolean SYNTHETIC_ERROR_ENABLED = false; // Changed from 'true' to 'false' to mitigate incident
    private static final double SYNTHETIC_ERROR_RATE = 0.35; // The rate at which synthetic errors were introduced

    public String processOrder(String orderId, String item, int quantity) {
        // Simulate some processing time for order placement
        try {
            Thread.sleep(50);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            // Log the interruption or handle it as appropriate
        }

        // Check for synthetic error burst condition
        if (SYNTHETIC_ERROR_ENABLED && random.nextDouble() < SYNTHETIC_ERROR_RATE) {
            System.err.println("Generating synthetic error for order: " + orderId);
            throw new RuntimeException("Synthetic error burst");
        }

        // Actual order processing logic would continue here
        String processingStatus = "Order " + orderId + " for " + quantity + "x " + item + " processed successfully.";
        System.out.println(processingStatus);
        return processingStatus;
    }
}
