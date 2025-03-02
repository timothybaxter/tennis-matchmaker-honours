import jwt from 'jsonwebtoken';
import { connectToDatabase, connectToSpecificDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';

// Enhanced searchUsers function with users-db access
export async function searchUsers(event) {
    console.log('searchUsers called with event:', JSON.stringify(event));

    try {
        // Check authentication
        console.log('Checking authentication...');
        const authHeader = event.headers.Authorization ||
            event.headers.authorization;

        if (!authHeader) {
            console.log('No auth header found');
            return createResponse(401, { message: 'Unauthorized' });
        }

        console.log('Auth header:', authHeader);

        // Extract token
        const token = authHeader.split(' ')[1];
        if (!token) {
            console.log('No token found in auth header');
            return createResponse(401, { message: 'Token not found' });
        }

        console.log('Verifying token...');

        // Verify token
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log('Token verified, decoded:', JSON.stringify(decoded));

            // Extract user ID and query
            const userId = decoded.userId;
            const query = event.queryStringParameters?.query;

            console.log(`User ID: ${userId}, Query: ${query}`);

            if (!query || query.length < 2) {
                console.log('Query too short or missing');
                return createResponse(400, { message: 'Search query must be at least 2 characters' });
            }

            // Connect to friends database to get existing friendships
            console.log('Connecting to friends database...');
            const friendsDb = await connectToDatabase();
            console.log('Connected to friends database');

            // Connect to users database to search users
            console.log('Connecting to users database...');
            const usersDb = await connectToSpecificDatabase('users-db');
            console.log('Connected to users database');

            // Get existing friendships
            console.log('Getting existing friendships...');
            const friendships = friendsDb.collection('friendships');
            const existingFriendships = await friendships.find({
                $or: [
                    { userId1: userId },
                    { userId2: userId }
                ]
            }).toArray();
            console.log(`Found ${existingFriendships.length} existing friendships`);

            // Extract friend IDs
            const connectedUserIds = [];
            existingFriendships.forEach(friendship => {
                if (friendship.userId1 === userId) {
                    connectedUserIds.push(friendship.userId2);
                } else {
                    connectedUserIds.push(friendship.userId1);
                }
            });

            // Add the current user's ID
            connectedUserIds.push(userId);
            console.log('User IDs to exclude:', connectedUserIds);

            // Search for users
            console.log('Searching for users...');
            const users = usersDb.collection('users');

            // Convert string IDs to ObjectIds, handling errors gracefully
            const excludeObjectIds = [];
            for (const id of connectedUserIds) {
                try {
                    excludeObjectIds.push(new ObjectId(id));
                } catch (err) {
                    console.warn(`Invalid ObjectId: ${id}, skipping`);
                }
            }

            // Build search query
            const searchQuery = {
                $and: [
                    // Exclude current user and existing friends/requests
                    { _id: { $nin: excludeObjectIds } },
                    // Match on name or email
                    {
                        $or: [
                            { name: { $regex: query, $options: 'i' } },
                            { email: { $regex: query, $options: 'i' } }
                        ]
                    }
                ]
            };

            console.log('Search query:', JSON.stringify(searchQuery));

            const searchResults = await users.find(searchQuery)
                .project({
                    password: 0, // Exclude passwords
                    _id: 1,
                    name: 1,
                    email: 1,
                    playerLevel: 1
                })
                .limit(10)
                .toArray();

            console.log(`Found ${searchResults.length} users matching the query`);

            return createResponse(200, { users: searchResults });

        } catch (jwtError) {
            console.error('JWT verification error:', jwtError);
            return createResponse(401, { message: 'Invalid token' });
        }
    } catch (error) {
        console.error('Error in searchUsers:', error);
        console.error('Stack trace:', error.stack);
        return createResponse(500, {
            message: 'Internal server error',
            error: error.message,
            stack: error.stack
        });
    }
}

// Simplified getFriends function that still accesses users-db
export async function getFriends(event) {
    console.log('getFriends called with event:', JSON.stringify(event));

    try {
        // Check authentication
        console.log('Checking authentication...');
        const authHeader = event.headers.Authorization ||
            event.headers.authorization;

        if (!authHeader) {
            console.log('No auth header found');
            return createResponse(401, { message: 'Unauthorized' });
        }

        console.log('Auth header:', authHeader);

        // Extract token
        const token = authHeader.split(' ')[1];
        if (!token) {
            console.log('No token found in auth header');
            return createResponse(401, { message: 'Token not found' });
        }

        console.log('Verifying token...');

        // Verify token
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log('Token verified, decoded:', JSON.stringify(decoded));

            // Extract user ID
            const userId = decoded.userId;
            console.log(`User ID: ${userId}`);

            // Connect to friends database
            console.log('Connecting to friends database...');
            const friendsDb = await connectToDatabase();
            console.log('Connected to friends database');

            // Connect to users database
            console.log('Connecting to users database...');
            const usersDb = await connectToSpecificDatabase('users-db');
            console.log('Connected to users database');

            // Find accepted friendships
            console.log('Finding friendships...');
            const friendships = friendsDb.collection('friendships');
            const existingFriendships = await friendships.find({
                $and: [
                    { $or: [{ userId1: userId }, { userId2: userId }] },
                    { status: 'accepted' }
                ]
            }).toArray();
            console.log(`Found ${existingFriendships.length} friendships`);

            // If no friendships, return empty array
            if (existingFriendships.length === 0) {
                return createResponse(200, { friends: [] });
            }

            // Extract friend IDs
            const friendIds = existingFriendships.map(friendship => {
                return friendship.userId1 === userId ? friendship.userId2 : friendship.userId1;
            });
            console.log('Friend IDs:', friendIds);

            // Get friend details
            console.log('Getting friend details...');
            const users = usersDb.collection('users');

            // Convert string IDs to ObjectIds, handling errors gracefully
            const friendObjectIds = [];
            for (const id of friendIds) {
                try {
                    friendObjectIds.push(new ObjectId(id));
                } catch (err) {
                    console.warn(`Invalid ObjectId: ${id}, skipping`);
                }
            }

            // Get user documents
            const friendDetails = await users.find({
                _id: { $in: friendObjectIds }
            }).project({
                password: 0, // Exclude passwords
                _id: 1,
                name: 1,
                email: 1,
                playerLevel: 1
            }).toArray();

            console.log(`Found ${friendDetails.length} friend details`);

            return createResponse(200, { friends: friendDetails });

        } catch (jwtError) {
            console.error('JWT verification error:', jwtError);
            return createResponse(401, { message: 'Invalid token' });
        }
    } catch (error) {
        console.error('Error in getFriends:', error);
        console.error('Stack trace:', error.stack);
        return createResponse(500, {
            message: 'Internal server error',
            error: error.message,
            stack: error.stack
        });
    }
}

// Implement other functions with the same approach
export async function sendFriendRequest(event) {
    console.log('sendFriendRequest called with event:', JSON.stringify(event));

    try {
        // Verify token
        console.log('Checking authentication...');
        const authHeader = event.headers.Authorization ||
            event.headers.authorization;

        if (!authHeader) {
            console.log('No auth header found');
            return createResponse(401, { message: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            console.log('No token found in auth header');
            return createResponse(401, { message: 'Token not found' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const senderId = decoded.userId;

        // Parse request body
        const { recipientId } = JSON.parse(event.body);

        if (!recipientId) {
            return createResponse(400, { message: 'recipientId is required' });
        }

        // Connect to databases
        const friendsDb = await connectToDatabase();
        const usersDb = await connectToSpecificDatabase('users-db');

        // Check if sender exists
        const users = usersDb.collection('users');
        const sender = await users.findOne({ _id: new ObjectId(senderId) });

        if (!sender) {
            return createResponse(404, { message: 'Sender not found' });
        }

        // Check if recipient exists
        const recipient = await users.findOne({ _id: new ObjectId(recipientId) });

        if (!recipient) {
            return createResponse(404, { message: 'Recipient not found' });
        }

        // Check if friendship already exists
        const friendships = friendsDb.collection('friendships');
        const existingFriendship = await friendships.findOne({
            $or: [
                { userId1: senderId, userId2: recipientId },
                { userId1: recipientId, userId2: senderId }
            ]
        });

        if (existingFriendship) {
            if (existingFriendship.status === 'accepted') {
                return createResponse(400, { message: 'Already friends' });
            }
            return createResponse(400, { message: 'Friend request already exists' });
        }

        // Create friendship
        const newFriendship = {
            userId1: senderId,
            userId2: recipientId,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await friendships.insertOne(newFriendship);

        return createResponse(201, {
            message: 'Friend request sent',
            friendshipId: result.insertedId
        });
    } catch (error) {
        console.error('Error in sendFriendRequest:', error);
        return createResponse(500, { message: 'Internal server error' });
    }
}

// Simplified getters for friend requests
export async function getFriendRequests(event) {
    console.log('getFriendRequests called');

    try {
        // Check authentication
        const authHeader = event.headers.Authorization || event.headers.authorization;

        if (!authHeader) {
            return createResponse(401, { message: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Token not found' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Connect to databases
        const friendsDb = await connectToDatabase();
        const usersDb = await connectToSpecificDatabase('users-db');

        // Get pending friend requests
        const friendships = friendsDb.collection('friendships');
        const requests = await friendships.find({
            userId2: userId,
            status: 'pending'
        }).toArray();

        if (requests.length === 0) {
            return createResponse(200, { friendRequests: [] });
        }

        // Get requester details
        const users = usersDb.collection('users');
        const requesterIds = requests.map(req => {
            try {
                return new ObjectId(req.userId1);
            } catch (err) {
                console.warn(`Invalid ObjectId: ${req.userId1}, skipping`);
                return null;
            }
        }).filter(id => id !== null);

        const requesters = await users.find({
            _id: { $in: requesterIds }
        }).project({
            password: 0,
            _id: 1,
            name: 1,
            email: 1,
            playerLevel: 1
        }).toArray();

        // Combine data
        const friendRequests = requests.map(req => {
            const requester = requesters.find(user =>
                user._id.toString() === req.userId1
            );
            return {
                friendshipId: req._id,
                requester: requester || { _id: req.userId1 },
                createdAt: req.createdAt
            };
        });

        return createResponse(200, { friendRequests });
    } catch (error) {
        console.error('Error in getFriendRequests:', error);
        return createResponse(500, { message: 'Internal server error' });
    }
}

// Basic implementation for the respond function
export async function respondToFriendRequest(event) {
    console.log('respondToFriendRequest called');

    try {
        // Check authentication
        const authHeader = event.headers.Authorization || event.headers.authorization;

        if (!authHeader) {
            return createResponse(401, { message: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            return createResponse(401, { message: 'Token not found' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Parse request body
        const { friendshipId, accept } = JSON.parse(event.body);

        if (!friendshipId) {
            return createResponse(400, { message: 'friendshipId is required' });
        }

        // Connect to database
        const friendsDb = await connectToDatabase();

        // Find the friendship
        const friendships = friendsDb.collection('friendships');
        let friendship;
        try {
            friendship = await friendships.findOne({
                _id: new ObjectId(friendshipId),
                userId2: userId,
                status: 'pending'
            });
        } catch (err) {
            return createResponse(400, { message: 'Invalid friendshipId format' });
        }

        if (!friendship) {
            return createResponse(404, { message: 'Friend request not found or not authorized' });
        }

        // Update or delete based on accept
        if (accept) {
            await friendships.updateOne(
                { _id: friendship._id },
                { $set: { status: 'accepted', updatedAt: new Date() } }
            );
            return createResponse(200, { message: 'Friend request accepted' });
        } else {
            await friendships.deleteOne({ _id: friendship._id });
            return createResponse(200, { message: 'Friend request rejected' });
        }
    } catch (error) {
        console.error('Error in respondToFriendRequest:', error);
        return createResponse(500, { message: 'Internal server error' });
    }
}