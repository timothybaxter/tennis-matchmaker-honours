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
        // Extract authorization token - checking all possible header formats
        const authHeader = event.headers.Authorization ||
            event.headers.authorization ||
            event.headers['Authorization'] ||
            event.headers['authorization'];

        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        // Extract token
        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Invalid authorization format' });
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            console.error('Token verification error:', error);
            return createResponse(401, { message: 'Invalid token' });
        }

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
export async function getProfile(event) {
    try {
        // Extract authorization token - checking all possible header formats
        const authHeader = event.headers.Authorization ||
            event.headers.authorization ||
            event.headers['Authorization'] ||
            event.headers['authorization'];

        if (!authHeader) {
            return createResponse(401, { message: 'No authorization token provided' });
        }

        // Extract token
        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Invalid authorization format' });
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            console.error('Token verification error:', error);
            return createResponse(401, { message: 'Invalid token' });
        }

        // Get the requested profile's userId from path parameters
        const profileUserId = event.pathParameters?.id;
        if (!profileUserId) {
            return createResponse(400, { message: 'User ID is required' });
        }

        console.log(`Looking up profile for user ID: ${profileUserId}`);

        // Connect to settings database - this is the same database that other functions use
        const db = await connectToDatabase(); // This connects to settings-db
        const settings = db.collection('user-settings');

        // Find user settings
        const userSettings = await settings.findOne({ userId: profileUserId });
        console.log(`Settings lookup result: ${JSON.stringify(userSettings)}`);

        if (!userSettings) {
            console.log(`No settings found for user ID: ${profileUserId}`);
            return createResponse(404, { message: 'User profile not found' });
        }

        // Parse the MongoDB ObjectId if needed for any fields
        const profile = {
            id: profileUserId,
            name: userSettings.name || 'Unknown User',
            email: userSettings.email || '',
            playerLevel: userSettings.playerLevel || 'Beginner',
            hometown: userSettings.hometown || '',
            theme: userSettings.theme || 'Wimbledon',
            bio: userSettings.bio || '',
            joinedAt: userSettings.createdAt || new Date(),
            lastActive: userSettings.updatedAt || new Date()
        };

        return createResponse(200, { profile });
    } catch (error) {
        console.error('Get profile error:', error);
        return createResponse(500, { message: 'Error retrieving profile', error: error.message });
    }
}
export async function partialUpdateSettings(event) {
    try {
        console.log('Partial update settings event:', JSON.stringify(event));

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

        // Check if settings exist for this user
        const existingSettings = await settings.findOne({ userId });
        console.log('Existing settings found:', !!existingSettings);

        if (!existingSettings) {
            // Create new settings document with default values plus updates
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

            console.log('Creating new settings document:', JSON.stringify(defaultSettings));
            await settings.insertOne(defaultSettings);

            return createResponse(200, {
                message: 'Settings created successfully',
                settings: {
                    name: defaultSettings.name,
                    email: defaultSettings.email,
                    playerLevel: defaultSettings.playerLevel,
                    theme: defaultSettings.theme,
                    hometown: defaultSettings.hometown
                }
            });
        }

        // Update existing settings
        console.log('Updating settings for userId:', userId);
        const result = await settings.updateOne(
            { userId },
            { $set: filteredUpdates }
        );

        console.log('Update result:', JSON.stringify(result));

        if (result.matchedCount === 0) {
            return createResponse(404, { message: 'Update failed - no document matched' });
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