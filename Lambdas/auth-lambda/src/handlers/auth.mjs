import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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
        console.log('Headers:', JSON.stringify(event.headers));

        const db = await connectToDatabase();
        const users = db.collection('users');

        // Extract authorization token
        const authHeader = event.headers.Authorization || event.headers.authorization;
        console.log('Auth header:', authHeader);

        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        console.log('Extracted token:', token);

        if (!token) {
            return createResponse(401, { message: 'Invalid authorization token format' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded token:', JSON.stringify(decoded));

        const updates = JSON.parse(event.body);
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

        const result = await users.updateOne(
            { _id: decoded.userId },
            { $set: filteredUpdates }
        );

        console.log('DB update result:', JSON.stringify(result));

        if (result.matchedCount === 0) {
            return createResponse(404, { message: 'User not found' });
        }

        // Get updated user to return in response
        const updatedUser = await users.findOne({ _id: decoded.userId });

        return createResponse(200, {
            message: 'User updated successfully',
            user: {
                id: updatedUser._id,
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

// Similarly update the updatePassword function to work with POST
export async function updatePassword(event) {
    try {
        const db = await connectToDatabase();
        const users = db.collection('users');

        // Extract userId from token
        const { authorization } = event.headers;
        if (!authorization) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const { currentPassword, newPassword } = JSON.parse(event.body);

        if (!currentPassword || !newPassword) {
            return createResponse(400, { message: 'Current password and new password are required' });
        }

        // Get user and verify current password
        const user = await users.findOne({ _id: decoded.userId });
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);

        if (!isValidPassword) {
            return createResponse(401, { message: 'Current password is incorrect' });
        }

        // Hash new password and update
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        const result = await users.updateOne(
            { _id: decoded.userId },
            { $set: { password: hashedPassword } }
        );

        if (result.matchedCount === 0) {
            return createResponse(404, { message: 'User not found' });
        }

        return createResponse(200, { message: 'Password updated successfully' });
    } catch (error) {
        console.error('Update password error:', error);
        if (error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Invalid token' });
        }
        return createResponse(500, { message: 'Error updating password' });
    }
}