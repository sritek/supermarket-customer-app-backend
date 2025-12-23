import { Response } from 'express';
import User from '../models/User';
import Address from '../models/Address';
import { AuthRequest } from '../middlewares/auth';

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?._id)
      .select('-password -otp -otpExpiry')
      .populate('addresses');

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, phone } = req.body;

    const user = await User.findById(req.user?._id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    if (name) user.name = name;
    if (phone) user.phone = phone;

    await user.save();

    res.json({
      success: true,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAddresses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const addresses = await Address.find({ user: req.user?._id }).sort({ isDefault: -1, createdAt: -1 });
    res.json({ success: true, addresses });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const addAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      isDefault
    } = req.body;

    if (!name || !phone || !addressLine1 || !city || !state || !pincode) {
      res.status(400).json({ success: false, error: 'All fields are required' });
      return;
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await Address.updateMany(
        { user: req.user?._id },
        { $set: { isDefault: false } }
      );
    }

    const address = await Address.create({
      user: req.user!._id,
      name,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      isDefault: isDefault || false
    });

    // Add to user's addresses array
    await User.findByIdAndUpdate(req.user?._id, {
      $push: { addresses: address._id }
    });

    res.status(201).json({ success: true, address });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { addressId } = req.params;
    const {
      name,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      isDefault
    } = req.body;

    const address = await Address.findOne({
      _id: addressId,
      user: req.user?._id
    });

    if (!address) {
      res.status(404).json({ success: false, error: 'Address not found' });
      return;
    }

    if (name) address.name = name;
    if (phone) address.phone = phone;
    if (addressLine1) address.addressLine1 = addressLine1;
    if (addressLine2 !== undefined) address.addressLine2 = addressLine2;
    if (city) address.city = city;
    if (state) address.state = state;
    if (pincode) address.pincode = pincode;

    // If setting as default, unset other defaults
    if (isDefault === true) {
      await Address.updateMany(
        { user: req.user?._id, _id: { $ne: addressId } },
        { $set: { isDefault: false } }
      );
      address.isDefault = true;
    } else if (isDefault === false) {
      address.isDefault = false;
    }

    await address.save();

    res.json({ success: true, address });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { addressId } = req.params;

    const address = await Address.findOne({
      _id: addressId,
      user: req.user?._id
    });

    if (!address) {
      res.status(404).json({ success: false, error: 'Address not found' });
      return;
    }

    await Address.findByIdAndDelete(addressId);

    // Remove from user's addresses array
    await User.findByIdAndUpdate(req.user?._id, {
      $pull: { addresses: addressId }
    });

    res.json({ success: true, message: 'Address deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const setDefaultAddress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { addressId } = req.params;

    const address = await Address.findOne({
      _id: addressId,
      user: req.user?._id
    });

    if (!address) {
      res.status(404).json({ success: false, error: 'Address not found' });
      return;
    }

    // Unset all other defaults
    await Address.updateMany(
      { user: req.user?._id, _id: { $ne: addressId } },
      { $set: { isDefault: false } }
    );

    address.isDefault = true;
    await address.save();

    res.json({ success: true, address });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

