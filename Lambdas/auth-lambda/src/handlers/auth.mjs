import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';

export async function register(event) {
    try {
        const body = JSON.parse(event.body);
        const { email, password, name, playerLevel } = body;

        if (!email || !password || !name || !playerLevel) {
            return createResponse(400, { message: 'All fields are required' });
        }

        const db = await connectToDatabase();
        const users = db.collection('users');

        const existingUser = await users.findOne({ email });
        if (existingUser) {
            return createResponse(409, { message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
            email,
            password: hashedPassword,
            name,
            playerLevel,
            createdAt: new Date()
        };

        await users.insertOne(newUser);
        const token = jwt.sign(
            { userId: newUser._id, email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return createResponse(201, {
            message: 'User created successfully',
            token,
            user: {
                email: newUser.email,
                name: newUser.name,
                playerLevel: newUser.playerLevel
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        return createResponse(500, { message: 'Error creating user', error: error.message });
    }
}

export async function login(event) {
    try {
        console.log('Starting login process');
        const { email, password } = JSON.parse(event.body);

        if (!email || !password) {
            return createResponse(400, { message: 'Email and password are required' });
        }

        const db = await connectToDatabase();
        const users = db.collection('users');

        const user = await users.findOne({ email });
        if (!user) {
            return createResponse(401, { message: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return createResponse(401, { message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        return createResponse(200, {
            message: 'Login successful',
            token,
            user: {
                email: user.email,
                name: user.name,
                playerLevel: user.playerLevel
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        return createResponse(500, { message: 'Error during login' });
    }
}

export async function updateUser(event) {
    try {
        console.log('UpdateUser event:', JSON.stringify(event));

        // Extract authorization token - checking all possible header formats
        const authHeader = event.headers.Authorization ||
            event.headers.authorization ||
            event.headers['Authorization'] ||
            event.headers['authorization'];

        console.log('Auth header detected:', authHeader);

        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        // Extract token
        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Invalid authorization format' });
        }

        console.log('Token extracted:', token.substring(0, 20) + '...');

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            console.error('Token verification error:', error);
            return createResponse(401, { message: 'Invalid token' });
        }

        console.log('Decoded token:', JSON.stringify(decoded));

        const db = await connectToDatabase();
        const users = db.collection('users');

        // Get the userId from the token
        const userId = decoded.userId;
        console.log('Looking for user with ID:', userId);

        // Find the user - try both as string and ObjectId
        let user;
        try {
            // First try with ObjectId
            user = await users.findOne({ _id: new ObjectId(userId) });
            console.log('Found user using ObjectId conversion');
        } catch (error) {
            console.error('Error with ObjectId, trying string ID:', error);
            try {
                // Fall back to string ID
                user = await users.findOne({ _id: userId });
            } catch (innerError) {
                console.error('Error finding user with string ID:', innerError);
            }
        }

        if (!user) {
            console.log('User not found with ID:', userId);
            return createResponse(404, { message: 'User not found' });
        }

        console.log('User found:', user.email);

        const updates = JSON.parse(event.body);
        console.log('Requested updates:', JSON.stringify(updates));

        // Check if this is a password update request
        if (updates.currentPassword && updates.newPassword) {
            console.log('Processing password update request');

            // Verify current password
            const isValidPassword = await bcrypt.compare(updates.currentPassword, user.password);
            if (!isValidPassword) {
                return createResponse(401, { message: 'Current password is incorrect' });
            }

            // Hash new password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(updates.newPassword, salt);

            // Update password in database
            const result = await users.updateOne(
                { _id: user._id },
                { $set: { password: hashedPassword } }
            );

            if (result.matchedCount === 0) {
                return createResponse(404, { message: 'Password update failed' });
            }

            return createResponse(200, { message: 'Password updated successfully' });
        }

        // Handle regular profile updates
        const allowedUpdates = ['name', 'email', 'playerLevel'];

        // Filter updates to only allow certain fields
        const filteredUpdates = Object.keys(updates)
            .filter(key => allowedUpdates.includes(key))
            .reduce((obj, key) => {
                obj[key] = updates[key];
                return obj;
            }, {});

        console.log('Filtered updates:', JSON.stringify(filteredUpdates));

        if (Object.keys(filteredUpdates).length === 0) {
            return createResponse(400, { message: 'No valid update fields provided' });
        }

        // Update the user document
        const result = await users.updateOne(
            { _id: user._id },
            { $set: filteredUpdates }
        );

        console.log('DB update result:', JSON.stringify(result));

        if (result.matchedCount === 0) {
            return createResponse(404, { message: 'Update failed - no document matched' });
        }

        // Get updated user to return in response
        const updatedUser = await users.findOne({ _id: user._id });

        return createResponse(200, {
            message: 'User updated successfully',
            user: {
                id: updatedUser._id.toString(),
                email: updatedUser.email,
                name: updatedUser.name,
                playerLevel: updatedUser.playerLevel
            }
        });
    } catch (error) {
        console.error('Update user error:', error);
        if (error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Invalid token' });
        }
        return createResponse(500, { message: 'Error updating user', error: error.message });
    }
}