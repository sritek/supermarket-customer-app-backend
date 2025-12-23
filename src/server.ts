import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import connectDB, { connectAdminDB } from "./config/database";
import errorHandler from "./middlewares/errorHandler";

// Routes
import authRoutes from "./routes/auth";
import productRoutes from "./routes/products";
import categoryRoutes from "./routes/categories";
import cartRoutes from "./routes/cart";
import orderRoutes from "./routes/orders";
import userRoutes from "./routes/user";
import { initRazorpay } from "./utils/razorpay";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Start server after database connections are established
const startServer = async () => {
  try {
    // Connect to both databases
    // Customer DB: for users, addresses, carts
    // Admin DB: for reading products, categories (read-only)
    await connectDB(); // Customer DB
    await connectAdminDB(); // Admin DB (for products/categories)
    
    // Now start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to establish database connections:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Initialize Razorpay
initRazorpay();

// Middlewares
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/user", userRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// Error handler (must be last)
app.use(errorHandler);
