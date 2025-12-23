import { Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { type StringValue } from "ms";
import User from "../models/User";
import { AuthRequest } from "../middlewares/auth";

const generateToken = (userId: string): string => {
  const jwtSecret = process.env.JWT_SECRET || "";
  const jwtExpire = (process.env.JWT_EXPIRE || "7d") as StringValue;

  return jwt.sign({ userId }, jwtSecret, {
    expiresIn: jwtExpire,
  });
};

const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const signup = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email, password, name, phone } = req.body;

    // Basic validation
    if (!email || !password || !name) {
      res.status(400).json({
        success: false,
        error: "Email, password, and name are required",
      });
      return;
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ success: false, error: "User already exists" });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
      name,
      phone,
      otp,
      otpExpiry,
    });

    // Return OTP in response for test mode (only in development)
    res.status(201).json({
      success: true,
      message: "OTP sent to your email",
      userId: user._id,
      otp: process.env.NODE_ENV === "development" ? otp : undefined, // Only return OTP in development
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyOTP = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    if (user.verified) {
      res.status(400).json({ success: false, error: "User already verified" });
      return;
    }

    if (user.otp !== otp) {
      res.status(400).json({ success: false, error: "Invalid OTP" });
      return;
    }

    if (user.otpExpiry && user.otpExpiry < new Date()) {
      res.status(400).json({ success: false, error: "OTP expired" });
      return;
    }

    // Verify user
    user.verified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Generate token
    const token = generateToken(user._id.toString());

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const resendOTP = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    if (user.verified) {
      res.status(400).json({ success: false, error: "User already verified" });
      return;
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Return OTP in response for test mode (only in development)
    res.json({
      success: true,
      message: "OTP resent successfully",
      otp: process.env.NODE_ENV === "development" ? otp : undefined, // Only return OTP in development
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const login = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
      res
        .status(400)
        .json({ success: false, error: "Email and password are required" });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }

    if (!user.verified) {
      res
        .status(401)
        .json({ success: false, error: "Please verify your email first" });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }

    // Generate token
    const token = generateToken(user._id.toString());

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const logout = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),
  });

  res.json({ success: true, message: "Logged out successfully" });
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?._id).select(
      "-password -otp -otpExpiry"
    );
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
