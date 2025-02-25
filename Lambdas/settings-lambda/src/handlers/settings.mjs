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

export async function updateSettings(event) {
    try {
        const { authorization } = event.headers;
        if (!authorization) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        const token = authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // For PUT requests with path parameters
        if (event.pathParameters && event.pathParameters.id) {
            const { id } = event.pathParameters;
            // Verify the token userId matches the path parameter
            if (decoded.userId !== id && id !== 'me') {
                return createResponse(403, { message: 'Not authorized to update these settings' });
            }
        }

        const updates = JSON.parse(event.body);
        const allowedUpdates = ['name', 'email', 'playerLevel', 'theme', 'hometown'];

        // Filter updates to only allow certain fields
        const filteredUpdates = Object.keys(updates)
            .filter(key => allowedUpdates.includes(key))
            .reduce((obj, key) => {
                obj[key] = updates[key];
                return obj;
            }, {});

        if (Object.keys(filteredUpdates).length === 0) {
            return createResponse(400, { message: 'No valid update fields provided' });
        }

        const db = await connectToDatabase();
        const settings = db.collection('user-settings');

        // Add updatedAt timestamp
        filteredUpdates.updatedAt = new Date();

        const result = await settings.updateOne(
            { userId: decoded.userId },
            { $set: filteredUpdates }
        );

        if (result.matchedCount === 0) {
            return createResponse(404, { message: 'Settings not found' });
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
        return createResponse(500, { message: 'Error updating settings' });
    }
}