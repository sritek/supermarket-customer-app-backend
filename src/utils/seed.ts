import dotenv from "dotenv";
import User from "../models/User";
import Address from "../models/Address";
import Cart from "../models/Cart";
import bcrypt from "bcryptjs";
import connectDB from "../config/database";

// CUSTOMER DATABASE SEED
// This seed populates ONLY customer-specific data: users, addresses, carts
// Must NOT seed: products, categories, orders (these are in admin DB)

dotenv.config();

const seedDatabase = async (): Promise<void> => {
  try {
    await connectDB();

    console.log("🗑️  Clearing existing customer data...");
    await Cart.deleteMany({});
    await Address.deleteMany({});
    await User.deleteMany({});

    console.log("✅ Cleared existing customer data");

    // Create 10 customers
    console.log("Creating customers...");
    const users = [];
    
    for (let i = 1; i <= 10; i++) {
      const hashedPassword = await bcrypt.hash("password123", 10);
      const user = await User.create({
        email: `customer${i}@example.com`,
        password: hashedPassword,
        name: `Customer ${i}`,
        phone: `9876543${String(i).padStart(3, "0")}`,
        role: "customer",
        verified: true,
      });
      users.push(user);
      console.log(`✅ Created user: ${user.email}`);
    }

    // Create demo user
    const hashedPassword = await bcrypt.hash("demo123", 10);
    const demoUser = await User.create({
      email: "demo@example.com",
      password: hashedPassword,
      name: "Demo User",
      phone: "9876543210",
      role: "customer",
      verified: true,
    });
    users.push(demoUser);
    console.log("✅ Created demo user: demo@example.com / demo123");

    // Create addresses for each user
    console.log("Creating addresses...");
    for (const user of users) {
      const address = await Address.create({
        user: user._id,
        name: user.name || "Home",
        phone: user.phone || "9876543210",
        addressLine1: `${Math.floor(Math.random() * 999) + 1} Main Street`,
        addressLine2: "Apartment 4B",
        city: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix"][
          Math.floor(Math.random() * 5)
        ],
        state: ["NY", "CA", "IL", "TX", "AZ"][Math.floor(Math.random() * 5)],
        pincode: String(Math.floor(Math.random() * 90000) + 10000),
        isDefault: true,
      });
      
      // Update user's addresses array
      user.addresses.push(address._id);
      await user.save();
      
      console.log(`✅ Created address for ${user.email}`);
    }

    // Create empty carts for some users (optional)
    console.log("Creating carts...");
    for (let i = 0; i < Math.min(5, users.length); i++) {
      await Cart.create({
        user: users[i]._id,
        items: [],
      });
      console.log(`✅ Created empty cart for ${users[i].email}`);
    }

    console.log("\n🎉 Customer DB seeded successfully!");
    console.log(`- ${users.length} Users created`);
    console.log(`- ${users.length} Addresses created`);
    console.log(`- ${Math.min(5, users.length)} Carts created`);
    console.log(`\n📋 Database Ownership:`);
    console.log(`   Customer DB (supermarket_customer): Users, Addresses, Carts`);
    console.log(`   Admin DB (supermarket_admin): Products, Categories, Orders`);
    console.log(`   Products/Categories are read from admin DB\n`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding customer database:", error);
    process.exit(1);
  }
};

seedDatabase();
