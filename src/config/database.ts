import mongoose, { Connection } from "mongoose";
import { ServerApiVersion } from "mongodb";

// CUSTOMER DATABASE OWNERSHIP
// This database owns customer-specific data: users, addresses, carts
// Orders are stored in admin DB (single source of truth)
// Must NOT contain: products, categories, inventory, orders
// Customer app must read products/categories from admin DB via API or direct connection

const clientOptions = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};

// Get customer database URI - defaults to supermarket_customer
const getCustomerDBURI = (): string => {
  // Use MONGO_CUSTOMER_URI if available, otherwise use base URI
  // The dbName option will set the actual database name
  if (process.env.MONGO_CUSTOMER_URI) {
    return process.env.MONGO_CUSTOMER_URI;
  }
  return (
    process.env.MONGODB_URI ||
    process.env.MONGO_ADMIN_URI ||
    "mongodb://localhost:27017"
  );
};

// Get admin database URI - for reading products/categories
const getAdminDBURI = (): string => {
  // Use MONGO_ADMIN_URI if available, otherwise use base URI
  // The dbName option will set the actual database name
  if (process.env.MONGO_ADMIN_URI) {
    return process.env.MONGO_ADMIN_URI;
  }
  return process.env.MONGODB_URI || "mongodb://localhost:27017";
};

// Admin database connection - for reading products/categories and writing orders
let adminDbConnection: Connection | null = null;

const connectAdminDB = async (): Promise<Connection> => {
  try {
    if (adminDbConnection && adminDbConnection.readyState === 1) {
      return adminDbConnection;
    }

    const mongoURI = getAdminDBURI();

    adminDbConnection = mongoose.createConnection(mongoURI, {
      ...clientOptions,
      dbName: "supermarket_admin",
    });

    // Wait for connection to be ready
    await new Promise<void>((resolve, reject) => {
      adminDbConnection!.once("connected", resolve);
      adminDbConnection!.once("error", reject);
    });

    console.log(`✅ Admin MongoDB Connected (for Customer App)`);
    console.log(`   Host: ${adminDbConnection.host}`);
    console.log(`   Database: ${adminDbConnection.name}`);
    console.log(
      `   Note: Customer app reads products/categories and writes orders to admin DB`
    );

    // Initialize admin models after connection is ready
    initializeAdminModels();

    return adminDbConnection;
  } catch (error) {
    console.error(
      "❌ Admin MongoDB connection error (for customer app):",
      error
    );
    process.exit(1);
  }
};

// Initialize admin models on admin connection
const initializeAdminModels = () => {
  if (!adminDbConnection || adminDbConnection.readyState !== 1) {
    return;
  }

  // Models will be initialized when imported if connection is ready
  // This is called after connection is established
};

// Connect to customer database (default connection)
const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = getCustomerDBURI();

    const conn = await mongoose.connect(mongoURI, {
      ...clientOptions,
      dbName: "supermarket_customer",
    });

    console.log(`✅ Customer MongoDB Connected Successfully`);
    console.log(`   Host: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);
    console.log(
      `   Note: This DB contains customer data (users, addresses, carts, orders)`
    );
    console.log(`   Products/Categories are stored in admin DB`);
  } catch (error) {
    console.error("❌ Customer MongoDB connection error:", error);
    console.error(
      "   Please check your MONGO_CUSTOMER_URI or MONGODB_URI in .env file"
    );
    console.error("   Format: mongodb://localhost:27017/supermarket_customer");
    process.exit(1);
  }
};

export { connectAdminDB, adminDbConnection };
export default connectDB;
