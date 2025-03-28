import jwt from 'jsonwebtoken';
import { connectToDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';

export async function createMatch(event) {
    try {
        const db = await connectToDatabase();
        const matches = db.collection('matches');

        const { courtLocation, posterName, matchTime, matchType, skillLevel } = JSON.parse(event.body);

        // Get user ID from JWT token
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        if (!courtLocation || !posterName || !matchTime || !matchType) {
            return createResponse(400, { message: 'Missing required fields' });
        }

        // In the createMatch function of match.mjs
        const newMatch = {
            courtLocation,
            posterName,
            matchTime: new Date(matchTime),
            matchType,
            skillLevel: skillLevel || 'Not Specified',
            createdAt: new Date(),
            status: 'open',
            creatorId: userId,
            participants: [userId], // Array to store all participant IDs
            requestedBy: [], // Array to store IDs of users who requested to join
            rejectedRequests: [] // New array to store IDs of rejected requests
        };

        const result = await matches.insertOne(newMatch);
        return createResponse(201, {
            message: 'Match created successfully',
            matchId: result.insertedId
        });
    } catch (error) {
        console.error('Create match error:', error);
        return createResponse(500, { message: 'Error creating match' });
    }
}

export async function getMatches(event) {
    try {
        const db = await connectToDatabase();
        const matches = db.collection('matches');
        const { courtLocation, matchType, status, skillLevel, personal } = event.queryStringParameters || {};

        // Get user ID from JWT token
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const query = {};
        if (courtLocation) query.courtLocation = courtLocation;
        if (matchType) query.matchType = matchType;
        if (status) query.status = status;
        if (skillLevel) query.skillLevel = skillLevel;

        // If personal flag is true, get matches created by the user OR matches where the user is a participant
        if (personal === 'true') {
            query.$or = [
                { creatorId: userId },
                { participants: userId }
            ];
        }

        console.log('Query:', JSON.stringify(query));

        const matchList = await matches.find(query)
            .sort({ matchTime: 1 })
            .limit(100)
            .toArray();

        console.log(`Found ${matchList.length} matches`);

        // After fetching matches, make sure to update status for any that are full
        matchList.forEach(match => {
            // Check if match is full based on participants and type
            const matchType = match.matchType?.toLowerCase();
            const participants = match.participants || [];
            const maxParticipants = (matchType === 'singles') ? 2 :
                ((matchType === 'doubles' || matchType === 'mixed') ? 4 : 2);

            if (match.status === 'open' && participants.length >= maxParticipants) {
                console.log(`Match ${match._id} is full but marked as open. Updating status to closed.`);
                match.status = 'closed';

                // Also update in database for future queries
                matches.updateOne(
                    { _id: match._id },
                    { $set: { status: 'closed' } }
                ).catch(err => console.error(`Error updating match status: ${err}`));
            }
        });

        return createResponse(200, { matches: matchList });
    } catch (error) {
        console.error('Get matches error:', error);
        return createResponse(500, { message: 'Error retrieving matches', error: error.message });
    }
}
// Add this new function to get a single match
export async function getMatch(event) {
    try {
        const db = await connectToDatabase();
        const matches = db.collection('matches');
        const matchId = event.pathParameters?.id;

        if (!matchId) {
            return createResponse(400, { message: 'Match ID is required' });
        }

        const match = await matches.findOne({ _id: new ObjectId(matchId) });

        if (!match) {
            return createResponse(404, { message: 'Match not found' });
        }

        return createResponse(200, match);
    } catch (error) {
        console.error('Get match error:', error);
        return createResponse(500, { message: 'Error retrieving match' });
    }
}

// Update the deleteMatch function to use path parameters
export async function deleteMatch(event) {
    try {
        const db = await connectToDatabase();
        const matches = db.collection('matches');
        const matchId = event.pathParameters?.id;

        if (!matchId) {
            return createResponse(400, { message: 'Match ID is required' });
        }

        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const match = await matches.findOne({
            _id: new ObjectId(matchId),
            creatorId: userId
        });

        if (!match) {
            return createResponse(404, { message: 'Match not found or unauthorized' });
        }

        await matches.deleteOne({ _id: new ObjectId(matchId) });
        return createResponse(200, { message: 'Match deleted successfully' });
    } catch (error) {
        console.error('Delete match error:', error);
        return createResponse(500, { message: 'Error deleting match' });
    }
}

// Request to join a match
export async function requestMatch(event) {
    try {
        // Extract and verify token
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Get match ID from path parameters
        const matchId = event.pathParameters?.id;
        if (!matchId) {
            return createResponse(400, { message: 'Match ID is required' });
        }

        const db = await connectToDatabase();
        const matches = db.collection('matches');

        // Find the match
        const match = await matches.findOne({ _id: new ObjectId(matchId) });
        if (!match) {
            return createResponse(404, { message: 'Match not found' });
        }

        // Check if user is the match creator (can't request your own match)
        if (match.creatorId === userId) {
            return createResponse(400, { message: 'You cannot request to join your own match' });
        }

        // Check if match is already closed
        if (match.status.toLowerCase() !== 'open') {
            return createResponse(400, { message: 'This match is no longer accepting requests' });
        }

        // Check if user has already requested
        if (match.requestedBy && match.requestedBy.includes(userId)) {
            return createResponse(400, { message: 'You have already requested to join this match' });
        }

        // Check if user is already a participant
        if (match.participants && match.participants.includes(userId)) {
            return createResponse(400, { message: 'You are already a participant in this match' });
        }

        // Add user to requestedBy array
        await matches.updateOne(
            { _id: new ObjectId(matchId) },
            { $addToSet: { requestedBy: userId } }
        );

        // Create a notification for the match creator
        try {
            // Get user info from users database
            const usersDb = await connectToSpecificDatabase('users-db');
            const users = usersDb.collection('users');
            const user = await users.findOne({ _id: new ObjectId(userId) });

            // Send notification if notification API is available
            if (process.env.NOTIFICATION_API_URL) {
                // Prepare notification data
                const notificationData = {
                    recipientId: match.creatorId,
                    senderId: userId,
                    senderName: user?.name || 'A player',
                    type: 'match_request',
                    content: `${user?.name || 'A player'} has requested to join your match at ${match.courtLocation}`,
                    relatedItemId: matchId
                };

                // Send to notification API
                await fetch(process.env.NOTIFICATION_API_URL + '/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.API_KEY || token}`
                    },
                    body: JSON.stringify(notificationData)
                });
            }
        } catch (notificationError) {
            console.error('Error sending match request notification:', notificationError);
            // Continue without failing the request process
        }

        return createResponse(200, {
            message: 'Match request sent successfully',
            matchId: matchId
        });
    } catch (error) {
        console.error('Request match error:', error);
        return createResponse(500, { message: 'Error requesting match', error: error.message });
    }
}

// Make sure this function is in your match.mjs file
export async function getMatchRequests(event) {
    try {
        // Extract and verify token
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Get match ID from path parameters
        const matchId = event.pathParameters?.id;
        if (!matchId) {
            return createResponse(400, { message: 'Match ID is required' });
        }

        const db = await connectToDatabase();
        const matches = db.collection('matches');

        // Find the match
        const match = await matches.findOne({ _id: new ObjectId(matchId) });
        if (!match) {
            return createResponse(404, { message: 'Match not found' });
        }

        // Check if user is the match creator
        if (match.creatorId !== userId) {
            return createResponse(403, { message: 'Only the match creator can view requests' });
        }

        // If there are no requests, return empty array
        if (!match.requestedBy || match.requestedBy.length === 0) {
            return createResponse(200, { requests: [] });
        }

        // Get user details for each requester from the same database
        // Instead of using connectToSpecificDatabase, we'll use the existing db connection
        // and assume users are in the same database
        const users = db.collection('users');

        const requesterIds = match.requestedBy.map(id => {
            try {
                return new ObjectId(id);
            } catch (e) {
                console.error('Invalid ObjectId format:', id);
                return null;
            }
        }).filter(id => id !== null);

        const requesters = await users.find({
            _id: { $in: requesterIds }
        }).project({
            _id: 1,
            name: 1,
            email: 1,
            playerLevel: 1
        }).toArray();

        // Map user IDs to user details
        const requestDetails = match.requestedBy.map(requesterId => {
            const requester = requesters.find(r => r._id.toString() === requesterId);
            return {
                id: requesterId,
                name: requester?.name || 'Unknown User',
                playerLevel: requester?.playerLevel || 'Unknown',
                email: requester?.email
            };
        });

        return createResponse(200, {
            requests: requestDetails,
            matchId: matchId
        });
    } catch (error) {
        console.error('Get match requests error:', error);
        return createResponse(500, { message: 'Error retrieving match requests', error: error.message });
    }
}
// Updated respondToMatchRequest function for match.mjs in Lambda
export async function respondToMatchRequest(event) {
    try {
        // Extract and verify token
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Get match ID from path parameters
        const matchId = event.pathParameters?.id;
        if (!matchId) {
            return createResponse(400, { message: 'Match ID is required' });
        }

        // Parse request body
        const { requesterId, accept } = JSON.parse(event.body);
        if (!requesterId) {
            return createResponse(400, { message: 'Requester ID is required' });
        }

        const db = await connectToDatabase();
        const matches = db.collection('matches');

        // Find the match
        const match = await matches.findOne({ _id: new ObjectId(matchId) });
        if (!match) {
            return createResponse(404, { message: 'Match not found' });
        }

        // Check if user is the match creator
        if (match.creatorId !== userId) {
            return createResponse(403, { message: 'Only the match creator can respond to requests' });
        }

        // Check if the requester has actually requested
        if (!match.requestedBy || !match.requestedBy.includes(requesterId)) {
            return createResponse(400, { message: 'No request found from this user' });
        }

        // Set up the update
        const updateOperation = {
            $pull: { requestedBy: requesterId }
        };

        // If accepting, add to participants
        if (accept) {
            updateOperation.$addToSet = { participants: requesterId };

            // Check if this makes the match full
            const matchType = match.matchType.toLowerCase();
            const currentParticipantCount = (match.participants || []).length;

            // Calculate new participant count
            const newParticipantCount = currentParticipantCount + 1;

            // Check if match would be full
            const maxParticipants = (matchType === 'singles') ? 2 :
                ((matchType === 'doubles' || matchType === 'mixed') ? 4 : 2);

            // If match is now full, update status to closed
            if (newParticipantCount >= maxParticipants) {
                updateOperation.$set = { status: 'closed' };
                console.log(`Match ${matchId} is now full. Setting status to closed.`);
            }
        }

        // Update the match
        await matches.updateOne(
            { _id: new ObjectId(matchId) },
            updateOperation
        );

        // Create a notification for the requester
        try {
            // Get user info for creator
            const usersDb = db.collection('users');
            const creator = await usersDb.findOne({ _id: new ObjectId(userId) });

            // Send notification if notification API is available
            if (process.env.NOTIFICATION_API_URL) {
                // Prepare notification data
                const notificationData = {
                    recipientId: requesterId,
                    senderId: userId,
                    senderName: creator?.name || 'Match creator',
                    type: accept ? 'match_request_accepted' : 'match_request_rejected',
                    content: accept
                        ? `Your request to join the match at ${match.courtLocation} has been accepted`
                        : `Your request to join the match at ${match.courtLocation} has been declined`,
                    relatedItemId: matchId
                };

                // Send to notification API
                await fetch(process.env.NOTIFICATION_API_URL + '/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.API_KEY || token}`
                    },
                    body: JSON.stringify(notificationData)
                });
            }
        } catch (notificationError) {
            console.error('Error sending match response notification:', notificationError);
            // Continue without failing the response process
        }

        return createResponse(200, {
            message: accept ? 'Request accepted successfully' : 'Request rejected successfully',
            matchId: matchId,
            requesterId: requesterId,
            accepted: accept,
            matchStatus: updateOperation.$set?.status || match.status
        });
    } catch (error) {
        console.error('Respond to match request error:', error);
        return createResponse(500, { message: 'Error responding to match request', error: error.message });
    }
}

export async function cancelMatchRequest(event) {
    try {
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const matchId = event.pathParameters?.id;
        if (!matchId) {
            return createResponse(400, { message: 'Match ID is required' });
        }

        const db = await connectToDatabase();
        const matches = db.collection('matches');

        // Find the match
        const match = await matches.findOne({ _id: new ObjectId(matchId) });
        if (!match) {
            return createResponse(404, { message: 'Match not found' });
        }

        // Check if user has requested to join
        if (!match.requestedBy || !match.requestedBy.includes(userId)) {
            return createResponse(400, { message: 'You have not requested to join this match' });
        }

        // Remove user from requestedBy array
        await matches.updateOne(
            { _id: new ObjectId(matchId) },
            { $pull: { requestedBy: userId } }
        );

        return createResponse(200, {
            message: 'Match request canceled successfully',
            matchId: matchId
        });
    } catch (error) {
        console.error('Cancel match request error:', error);
        return createResponse(500, { message: 'Error canceling match request', error: error.message });
    }
}

export async function getRequestedMatches(event) {
    console.log("Starting getRequestedMatches function");
    try {
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;
        console.log(`Processing request for user: ${userId}`);

        const db = await connectToDatabase();
        console.log("Database connection successful");
        const matches = db.collection('matches');

        // Find matches where user is in the requestedBy array (pending requests)
        const pendingMatches = await matches.find({
            requestedBy: userId
        }).sort({ matchTime: 1 }).toArray();
        console.log(`Found ${pendingMatches.length} pending matches`);

        // Find matches where user is a participant but not the creator 
        // AND not in dismissedAcceptedRequests (accepted requests)
        const acceptedMatches = await matches.find({
            participants: userId,
            creatorId: { $ne: userId },
            $or: [
                { dismissedAcceptedRequests: { $exists: false } },
                { dismissedAcceptedRequests: { $nin: [userId] } }
            ]
        }).sort({ matchTime: 1 }).toArray();
        console.log(`Found ${acceptedMatches.length} accepted matches`);

        // Find matches where user is in the rejectedRequests array
        // AND not in dismissedRejectedRequests (rejected requests)
        const rejectedMatches = await matches.find({
            rejectedRequests: userId,
            $or: [
                { dismissedRejectedRequests: { $exists: false } },
                { dismissedRejectedRequests: { $nin: [userId] } }
            ]
        }).sort({ matchTime: 1 }).toArray();
        console.log(`Found ${rejectedMatches.length} rejected matches`);

        // Create an enhanced response with request status
        const enhancedMatches = [
            ...pendingMatches.map(match => ({ ...match, requestStatus: 'pending' })),
            ...acceptedMatches.map(match => ({ ...match, requestStatus: 'accepted' })),
            ...rejectedMatches.map(match => ({ ...match, requestStatus: 'rejected' }))
        ];

        console.log(`Returning ${enhancedMatches.length} total matches`);

        return createResponse(200, { matches: enhancedMatches });
    } catch (error) {
        console.error('Get requested matches error:', error);
        console.error('Error stack:', error.stack);
        return createResponse(500, { message: 'Error retrieving requested matches', error: error.message });
    }
}
// Dismiss a rejected match request notification
export async function dismissRejectedRequest(event) {
    try {
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const matchId = event.pathParameters?.id;
        if (!matchId) {
            return createResponse(400, { message: 'Match ID is required' });
        }

        const db = await connectToDatabase();
        const matches = db.collection('matches');

        // Find the match
        const match = await matches.findOne({ _id: new ObjectId(matchId) });
        if (!match) {
            return createResponse(404, { message: 'Match not found' });
        }

        // Check if user is in the rejectedRequests array
        if (!match.rejectedRequests || !match.rejectedRequests.includes(userId)) {
            return createResponse(400, { message: 'No rejected request found for this match' });
        }

        // Add user to the dismissedRejectedRequests array if it doesn't exist
        if (!match.dismissedRejectedRequests) {
            await matches.updateOne(
                { _id: new ObjectId(matchId) },
                { $set: { dismissedRejectedRequests: [userId] } }
            );
        } else {
            // Add to existing array if not already there
            await matches.updateOne(
                { _id: new ObjectId(matchId) },
                { $addToSet: { dismissedRejectedRequests: userId } }
            );
        }

        return createResponse(200, {
            message: 'Rejected request dismissed successfully',
            matchId: matchId
        });
    } catch (error) {
        console.error('Dismiss rejected request error:', error);
        return createResponse(500, { message: 'Error dismissing rejected request', error: error.message });
    }
}
export async function dismissAcceptedRequest(event) {
    try {
        const token = event.headers.Authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const matchId = event.pathParameters?.id;
        if (!matchId) {
            return createResponse(400, { message: 'Match ID is required' });
        }

        const db = await connectToDatabase();
        const matches = db.collection('matches');

        // Find the match
        const match = await matches.findOne({ _id: new ObjectId(matchId) });
        if (!match) {
            return createResponse(404, { message: 'Match not found' });
        }

        // Check if user is a participant but not the creator (meaning they were accepted)
        if (!match.participants.includes(userId) || match.creatorId === userId) {
            return createResponse(400, { message: 'You are not an accepted participant in this match' });
        }

        // Add user to the dismissedAcceptedRequests array if it doesn't exist
        if (!match.dismissedAcceptedRequests) {
            await matches.updateOne(
                { _id: new ObjectId(matchId) },
                { $set: { dismissedAcceptedRequests: [userId] } }
            );
        } else {
            // Add to existing array if not already there
            await matches.updateOne(
                { _id: new ObjectId(matchId) },
                { $addToSet: { dismissedAcceptedRequests: userId } }
            );
        }

        return createResponse(200, {
            message: 'Accepted request dismissed successfully',
            matchId: matchId
        });
    } catch (error) {
        console.error('Dismiss accepted request error:', error);
        return createResponse(500, { message: 'Error dismissing accepted request', error: error.message });
    }
}
export async function updateMatch(event) {
    try {
        const db = await connectToDatabase();
        const matches = db.collection('matches');

        // Extract match ID from path parameters
        const matchId = event.pathParameters?.id;
        if (!matchId) {
            return createResponse(400, { message: 'Match ID is required' });
        }

        // Parse the request body for update data
        let updateData;
        try {
            updateData = JSON.parse(event.body);
        } catch (error) {
            return createResponse(400, { message: 'Invalid request body format', details: error.message });
        }

        // Extract and verify JWT token to get userId
        const authHeader = event.headers.Authorization || event.headers.authorization;
        if (!authHeader) {
            return createResponse(401, { message: 'Authorization header is required' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId;

        // Find the match to ensure it exists and user is authorized
        const match = await matches.findOne({
            _id: new ObjectId(matchId),
            creatorId: userId
        });

        if (!match) {
            return createResponse(404, { message: 'Match not found or you are not authorized to update it' });
        }

        // Process date fields
        if (updateData.matchTime) {
            updateData.matchTime = new Date(updateData.matchTime);
        }

        // Perform the update
        await matches.updateOne(
            { _id: new ObjectId(matchId) },
            { $set: updateData }
        );

        // Return success response
        return createResponse(200, {
            message: 'Match updated successfully',
            matchId: matchId,
            updatedFields: Object.keys(updateData)
        });
    } catch (error) {
        console.error('Update match error:', error);

        // Handle specific errors more gracefully
        if (error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Invalid authentication token' });
        }

        if (error.name === 'TokenExpiredError') {
            return createResponse(401, { message: 'Authentication token expired' });
        }

        return createResponse(500, {
            message: 'Error updating match',
            error: error.message
        });
    }
}