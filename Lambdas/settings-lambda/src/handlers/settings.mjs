import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';

export async function createSettings(event) {
    try {
        const body = JSON.parse(event.body);
        const { userId, name, email, playerLevel } = body;

        if (!userId || !name || !email || !playerLevel) {
            return createResponse(400, { message: 'All fields are required' });
        }

        const db = await connectToDatabase();
        const settings = db.collection('user-settings');

        const existingSettings = await settings.findOne({ userId });
        if (existingSettings) {
            return createResponse(409, { message: 'Settings already exist for this user' });
        }

        const newSettings = {
            userId,
            name,
            email,
            playerLevel,
            theme: 'Wimbledon',
            hometown: '',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await settings.insertOne(newSettings);

        return createResponse(201, {
            message: 'Settings created successfully',
            settings: newSettings
        });
    } catch (error) {
        console.error('Create settings error:', error);
        return createResponse(500, { message: 'Error creating settings' });
    }
}

export async function getSettings(event) {
    try {
        const { authorization } = event.headers;
        if (!authorization) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const db = await connectToDatabase();
        const settings = db.collection('user-settings');

        const userSettings = await settings.findOne({ userId: decoded.userId });
        if (!userSettings) {
            return createResponse(404, { message: 'Settings not found' });
        }

        return createResponse(200, {
            settings: {
                name: userSettings.name,
                email: userSettings.email,
                playerLevel: userSettings.playerLevel,
                theme: userSettings.theme,
                hometown: userSettings.hometown
            }
        });
    } catch (error) {
        console.error('Get settings error:', error);
        if (error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Invalid token' });
        }
        return createResponse(500, { message: 'Error retrieving settings' });
    }
}

// Add this to your settings.mjs file
export async function updateSettings(event) {
    try {
        console.log('Update settings event:', JSON.stringify(event));

        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        console.log('Token extracted:', token.substring(0, 20) + '...');

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Decoded token:', JSON.stringify(decoded));

        const updates = JSON.parse(event.body);
        console.log('Update request body:', JSON.stringify(updates));

        const allowedUpdates = ['name', 'email', 'playerLevel', 'theme', 'hometown'];

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

        const db = await connectToDatabase();
        const settings = db.collection('user-settings');

        // Add updatedAt timestamp
        filteredUpdates.updatedAt = new Date();

        console.log('Updating settings for userId:', decoded.userId);

        const result = await settings.updateOne(
            { userId: decoded.userId },
            { $set: filteredUpdates }
        );

        console.log('Update result:', JSON.stringify(result));

        if (result.matchedCount === 0) {
            console.log('No matching document found. Creating new settings document.');

            // If no settings document exists, create one
            const newSettings = {
                userId: decoded.userId,
                ...filteredUpdates,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await settings.insertOne(newSettings);

            return createResponse(200, {
                message: 'Settings created successfully',
                settings: newSettings
            });
        }

        // Get updated settings to return
        const updatedSettings = await settings.findOne({ userId: decoded.userId });

        return createResponse(200, {
            message: 'Settings updated successfully',
            settings: {
                name: updatedSettings.name,
                email: updatedSettings.email,
                playerLevel: updatedSettings.playerLevel,
                theme: updatedSettings.theme,
                hometown: updatedSettings.hometown
            }
        });
    } catch (error) {
        console.error('Update settings error:', error);
        if (error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Invalid token' });
        }
        return createResponse(500, { message: 'Error updating settings', error: error.message });
    }
}
export async function partialUpdateSettings(event) {
    try {
        console.log('Partial update settings event:', JSON.stringify(event));

        // Extract authorization token
        const authHeader = event.headers.Authorization ||
            event.headers.authorization ||
            event.headers['Authorization'] ||
            event.headers['authorization'];

        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;
        console.log('User ID from token:', userId);

        const updates = JSON.parse(event.body);
        console.log('Update request body:', JSON.stringify(updates));

        const allowedUpdates = ['name', 'email', 'playerLevel', 'theme', 'hometown'];

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

        const db = await connectToDatabase();
        const settings = db.collection('user-settings');

        // Add updatedAt timestamp
        filteredUpdates.updatedAt = new Date();

        const result = await settings.updateOne(
            { userId: userId },
            { $set: filteredUpdates }
        );

        console.log('Update result:', JSON.stringify(result));

        if (result.matchedCount === 0) {
            // If no document exists, create one with default values plus the update
            const defaultSettings = {
                userId,
                name: "",
                email: "",
                playerLevel: "Beginner",
                theme: "Wimbledon",
                hometown: "",
                createdAt: new Date(),
                updatedAt: new Date(),
                ...filteredUpdates
            };

            await settings.insertOne(defaultSettings);

            return createResponse(200, {
                message: 'Settings created successfully',
                settings: defaultSettings
            });
        }

        // Get updated settings to return
        const updatedSettings = await settings.findOne({ userId });

        return createResponse(200, {
            message: 'Settings updated successfully',
            settings: {
                name: updatedSettings.name,
                email: updatedSettings.email,
                playerLevel: updatedSettings.playerLevel,
                theme: updatedSettings.theme,
                hometown: updatedSettings.hometown
            }
        });
    } catch (error) {
        console.error('Partial update settings error:', error);
        if (error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Invalid token' });
        }
        return createResponse(500, { message: 'Error updating settings', error: error.message });
    }
}