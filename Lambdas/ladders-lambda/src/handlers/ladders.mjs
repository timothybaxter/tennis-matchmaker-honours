// src/handlers/ladders.mjs
import jwt from 'jsonwebtoken';
import { connectToDatabase, connectToSpecificDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';
import fetch from 'node-fetch';

// Get all ladders
export async function getLadders(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        console.log('Getting ladders for user:', userId);

        // Check if we want only user's ladders
        const queryParams = event.queryStringParameters || {};
        const onlyUserLadders = queryParams.personal === 'true';

        // Connect to ladders database
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');

        // Build query
        const query = {};

        // Filter by user if personal flag is set
        if (onlyUserLadders) {
            query.$or = [
                { creatorId: userId },
                { 'positions.playerId': userId }
            ];
        }

        // Filter by visibility if not personal
        if (!onlyUserLadders) {
            query.visibility = 'public';
        }

        // Filter by status if provided
        if (queryParams.status) {
            query.status = queryParams.status;
        }

        // Filter by skill level if provided
        if (queryParams.skillLevel) {
            query.skillLevel = queryParams.skillLevel;
        }

        console.log('Query:', JSON.stringify(query));

        // Get ladders
        const ladderList = await ladders.find(query)
            .sort({ createdAt: -1 })
            .toArray();

        console.log(`Found ${ladderList.length} ladders`);

        // Connect to users database to get creator and player details
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Get unique user IDs from ladders
        const userIds = new Set();
        ladderList.forEach(ladder => {
            if (ladder.creatorId) userIds.add(ladder.creatorId);
            if (ladder.positions && Array.isArray(ladder.positions)) {
                ladder.positions.forEach(position => {
                    if (position.playerId) userIds.add(position.playerId);
                });
            }
        });

        // Convert string IDs to ObjectIds
        const userObjectIds = Array.from(userIds)
            .map(id => {
                try { return new ObjectId(id); }
                catch (e) { return null; }
            })
            .filter(id => id !== null);

        // Get user details
        const userDetails = await users.find({
            _id: { $in: userObjectIds }
        }).project({
            _id: 1,
            name: 1,
            playerLevel: 1
        }).toArray();

        // Create a lookup for user details
        const userLookup = {};
        userDetails.forEach(user => {
            userLookup[user._id.toString()] = {
                name: user.name,
                playerLevel: user.playerLevel
            };
        });

        // Enhance ladder data with user details
        const enhancedLadders = ladderList.map(ladder => {
            // Enhance with creator details
            let enhancedLadder = {
                ...ladder,
                id: ladder._id.toString(),
                creatorDetails: ladder.creatorId && userLookup[ladder.creatorId]
                    ? userLookup[ladder.creatorId]
                    : { name: 'Unknown User', playerLevel: 'Beginner' }
            };

            // Enhance with player details if available
            if (ladder.positions && Array.isArray(ladder.positions)) {
                enhancedLadder.positions = ladder.positions.map(position => {
                    return {
                        ...position,
                        playerDetails: position.playerId && userLookup[position.playerId]
                            ? userLookup[position.playerId]
                            : { name: 'Unknown User', playerLevel: 'Beginner' }
                    };
                });
            }

            return enhancedLadder;
        });

        return createResponse(200, { ladders: enhancedLadders });
    } catch (error) {
        console.error('Get ladders error:', error);
        return createResponse(500, { message: 'Error retrieving ladders', error: error.message });
    }
}

// Get ladder by ID
export async function getLadderById(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const ladderId = event.pathParameters?.id;

        if (!ladderId) {
            return createResponse(400, { message: 'Ladder ID is required' });
        }

        console.log(`Getting ladder ${ladderId} for user ${userId}`);

        // Connect to ladders database
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');
        const matches = db.collection('competitiveMatches');

        // Get ladder
        let ladder;
        try {
            ladder = await ladders.findOne({ _id: new ObjectId(ladderId) });
        } catch (error) {
            console.error('Invalid ladder ID format:', error);
            return createResponse(400, { message: 'Invalid ladder ID format' });
        }

        if (!ladder) {
            return createResponse(404, { message: 'Ladder not found' });
        }

        // Check if the ladder is private and the user is not the creator or a participant
        if (ladder.visibility === 'private' &&
            ladder.creatorId !== userId &&
            !ladder.positions.some(pos => pos.playerId === userId)) {
            return createResponse(403, { message: 'You do not have access to this ladder' });
        }

        // Connect to users database to get creator and player details
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Get unique user IDs from ladder
        const userIds = new Set();
        if (ladder.creatorId) userIds.add(ladder.creatorId);
        if (ladder.positions && Array.isArray(ladder.positions)) {
            ladder.positions.forEach(position => {
                if (position.playerId) userIds.add(position.playerId);
            });
        }

        // Convert string IDs to ObjectIds
        const userObjectIds = Array.from(userIds)
            .map(id => {
                try { return new ObjectId(id); }
                catch (e) { return null; }
            })
            .filter(id => id !== null);

        // Get user details
        const userDetails = await users.find({
            _id: { $in: userObjectIds }
        }).project({
            _id: 1,
            name: 1,
            playerLevel: 1
        }).toArray();

        // Create a lookup for user details
        const userLookup = {};
        userDetails.forEach(user => {
            userLookup[user._id.toString()] = {
                id: user._id.toString(),
                name: user.name,
                playerLevel: user.playerLevel
            };
        });

        // Get ladder matches
        const ladderMatches = await matches.find({
            ladderId: ladderId
        }).sort({ createdAt: -1 }).toArray();

        // Enhance ladder with user details and matches
        const enhancedLadder = {
            ...ladder,
            id: ladder._id.toString(),
            creatorDetails: ladder.creatorId && userLookup[ladder.creatorId]
                ? userLookup[ladder.creatorId]
                : { name: 'Unknown User', playerLevel: 'Beginner' },
            positions: ladder.positions && Array.isArray(ladder.positions)
                ? ladder.positions.map(position => ({
                    ...position,
                    playerDetails: position.playerId && userLookup[position.playerId]
                        ? userLookup[position.playerId]
                        : { name: 'Unknown User', playerLevel: 'Beginner' }
                })).sort((a, b) => a.rank - b.rank)
                : [],
            matches: ladderMatches.map(match => ({
                ...match,
                id: match._id.toString(),
                challenger: userLookup[match.challengerId] || { name: 'Unknown User' },
                challengee: userLookup[match.challengeeId] || { name: 'Unknown User' }
            }))
        };

        // Determine which players the current user can challenge
        if (ladder.status === 'active') {
            const userPosition = ladder.positions.find(pos => pos.playerId === userId);
            if (userPosition) {
                const userRank = userPosition.rank;
                // Can challenge up to 2 ranks above
                const challengeableRanks = [userRank - 1, userRank - 2].filter(rank => rank > 0);

                enhancedLadder.challengeablePositions = ladder.positions
                    .filter(pos => challengeableRanks.includes(pos.rank))
                    .map(pos => ({
                        ...pos,
                        playerDetails: pos.playerId && userLookup[pos.playerId]
                            ? userLookup[pos.playerId]
                            : { name: 'Unknown User', playerLevel: 'Beginner' }
                    }));

                // Check for active challenges
                enhancedLadder.userHasActiveChallenge = ladderMatches.some(match =>
                    (match.challengerId === userId || match.challengeeId === userId) &&
                    ['scheduled', 'accepted'].includes(match.status)
                );
            }
        }

        return createResponse(200, { ladder: enhancedLadder });
    } catch (error) {
        console.error('Get ladder by ID error:', error);
        return createResponse(500, { message: 'Error retrieving ladder', error: error.message });
    }
}

// Create ladder
export async function createLadder(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const creatorId = token.decoded.userId;

        // Parse request body
        if (!event.body) {
            return createResponse(400, { message: 'Request body is required' });
        }

        let parsedBody;
        try {
            parsedBody = JSON.parse(event.body);
        } catch (error) {
            return createResponse(400, { message: 'Invalid JSON format', details: error.message });
        }

        // Validate required fields
        const { name, visibility, challengeWindow, skillLevel } = parsedBody;

        if (!name) {
            return createResponse(400, { message: 'Ladder name is required' });
        }

        if (!visibility || !['public', 'private'].includes(visibility)) {
            return createResponse(400, { message: 'Valid visibility (public/private) is required' });
        }

        if (!challengeWindow || isNaN(parseInt(challengeWindow))) {
            return createResponse(400, { message: 'Challenge window (hours) is required' });
        }

        // Connect to ladders database
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');

        // Create new ladder
        const newLadder = {
            name,
            visibility,
            challengeWindow: parseInt(challengeWindow),
            skillLevel: skillLevel || 'All Levels',
            status: 'active', // Ladders start active immediately
            creatorId,
            positions: [
                { rank: 1, playerId: creatorId } // Creator starts at rank 1
            ],
            createdAt: new Date()
        };

        // Insert ladder
        const result = await ladders.insertOne(newLadder);
        const ladderId = result.insertedId.toString();

        // Get creator details from users database
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        const creator = await users.findOne({ _id: new ObjectId(creatorId) });

        // Return the created ladder with creator details
        return createResponse(201, {
            message: 'Ladder created successfully',
            ladder: {
                ...newLadder,
                id: ladderId,
                creatorDetails: {
                    name: creator?.name || 'Unknown User',
                    playerLevel: creator?.playerLevel || 'Beginner'
                }
            }
        });
    } catch (error) {
        console.error('Create ladder error:', error);
        return createResponse(500, { message: 'Error creating ladder', error: error.message });
    }
}

// Join ladder
export async function joinLadder(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const ladderId = event.pathParameters?.id;

        if (!ladderId) {
            return createResponse(400, { message: 'Ladder ID is required' });
        }

        // Connect to ladders database
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');

        // Get ladder
        let ladder;
        try {
            ladder = await ladders.findOne({ _id: new ObjectId(ladderId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ladder ID format' });
        }

        if (!ladder) {
            return createResponse(404, { message: 'Ladder not found' });
        }

        // Check if ladder is active
        if (ladder.status !== 'active') {
            return createResponse(400, { message: 'Cannot join inactive ladder' });
        }

        // Check if user is already in ladder
        if (ladder.positions.some(pos => pos.playerId === userId)) {
            return createResponse(400, { message: 'You are already participating in this ladder' });
        }

        // Add player to the bottom of the ladder
        const newRank = ladder.positions.length + 1;

        // Update ladder by adding player
        await ladders.updateOne(
            { _id: new ObjectId(ladderId) },
            { $push: { positions: { rank: newRank, playerId: userId } } }
        );

        // Get user details
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');
        const user = await users.findOne({ _id: new ObjectId(userId) });

        // Notify ladder creator
        try {
            if (ladder.creatorId !== userId) {
                const notificationRequest = {
                    recipientId: ladder.creatorId,
                    senderId: userId,
                    senderName: user?.name || 'Unknown User',
                    ladderId: ladderId,
                    ladderName: ladder.name,
                    type: 'ladder_join'
                };

                // Make request to your notification API
                if (process.env.NOTIFICATION_API_URL) {
                    await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/ladders', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(notificationRequest)
                    });
                }
            }
        } catch (notificationError) {
            console.error('Error sending join notification:', notificationError);
            // Continue without failing
        }

        return createResponse(200, {
            message: 'Successfully joined ladder',
            userDetails: {
                id: userId,
                name: user?.name || 'Unknown User',
                playerLevel: user?.playerLevel || 'Beginner',
                rank: newRank
            }
        });
    } catch (error) {
        console.error('Join ladder error:', error);
        return createResponse(500, { message: 'Error joining ladder', error: error.message });
    }
}

// Issue challenge
export async function issueChallenge(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const challengerId = token.decoded.userId;
        const ladderId = event.pathParameters?.id;

        if (!ladderId) {
            return createResponse(400, { message: 'Ladder ID is required' });
        }

        // Parse request body
        if (!event.body) {
            return createResponse(400, { message: 'Request body is required' });
        }

        let parsedBody;
        try {
            parsedBody = JSON.parse(event.body);
        } catch (error) {
            return createResponse(400, { message: 'Invalid JSON format', details: error.message });
        }

        // Validate required fields
        const { challengeeId } = parsedBody;

        if (!challengeeId) {
            return createResponse(400, { message: 'Challengee ID is required' });
        }

        // Connect to ladders database
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');
        const matches = db.collection('competitiveMatches');

        // Get ladder
        let ladder;
        try {
            ladder = await ladders.findOne({ _id: new ObjectId(ladderId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ladder ID format' });
        }

        if (!ladder) {
            return createResponse(404, { message: 'Ladder not found' });
        }

        // Check if ladder is active
        if (ladder.status !== 'active') {
            return createResponse(400, { message: 'Cannot issue challenge in inactive ladder' });
        }

        // Check if both users are in the ladder
        const challengerPosition = ladder.positions.find(pos => pos.playerId === challengerId);
        const challengeePosition = ladder.positions.find(pos => pos.playerId === challengeeId);

        if (!challengerPosition) {
            return createResponse(400, { message: 'You are not participating in this ladder' });
        }

        if (!challengeePosition) {
            return createResponse(400, { message: 'The player you are challenging is not in this ladder' });
        }

        // Check if player can challenge (must be within 2 ranks)
        if (challengerPosition.rank - challengeePosition.rank > 2 || challengeePosition.rank >= challengerPosition.rank) {
            return createResponse(400, { message: 'You can only challenge players 1-2 ranks above you' });
        }

        // Check if player already has an active challenge
        const existingChallenge = await matches.findOne({
            ladderId: ladderId,
            $or: [
                { challengerId: challengerId },
                { challengeeId: challengerId }
            ],
            status: { $in: ['scheduled', 'accepted'] }
        });

        if (existingChallenge) {
            return createResponse(400, { message: 'You already have an active challenge' });
        }

        // Check if challengee already has an active challenge
        const existingChallengeeChallenge = await matches.findOne({
            ladderId: ladderId,
            $or: [
                { challengerId: challengeeId },
                { challengeeId: challengeeId }
            ],
            status: { $in: ['scheduled', 'accepted'] }
        });

        if (existingChallengeeChallenge) {
            return createResponse(400, { message: 'The player you are challenging already has an active challenge' });
        }

        // Create challenge
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + ladder.challengeWindow);

        const challenge = {
            ladderId: ladderId,
            challengerId: challengerId,
            challengeeId: challengeeId,
            challengerRank: challengerPosition.rank,
            challengeeRank: challengeePosition.rank,
            status: 'accepted', 
            createdAt: new Date(),
            deadline: deadline,
            completedAt: null,
            result: null
        };

        const result = await matches.insertOne(challenge);
        const challengeId = result.insertedId.toString();

        // Notify challengee
        try {
            const usersDb = await connectToSpecificDatabase('users-db');
            const users = usersDb.collection('users');
            const challenger = await users.findOne({ _id: new ObjectId(challengerId) });

            const notificationRequest = {
                recipientId: challengeeId,
                senderId: challengerId,
                senderName: challenger?.name || 'Unknown User',
                ladderId: ladderId,
                ladderName: ladder.name,
                matchId: challengeId,
                type: 'ladder_challenge'
            };

            // Make request to your notification API
            if (process.env.NOTIFICATION_API_URL) {
                await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/ladders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(notificationRequest)
                });
            }
        } catch (notificationError) {
            console.error('Error sending challenge notification:', notificationError);
            // Continue without failing
        }

        return createResponse(201, {
            message: 'Challenge issued successfully',
            challenge: {
                ...challenge,
                id: challengeId
            }
        });
    } catch (error) {
        console.error('Issue challenge error:', error);
        return createResponse(500, { message: 'Error issuing challenge', error: error.message });
    }
}


// Submit match result for Ladder
export async function submitMatchResult(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const ladderId = event.pathParameters?.id;
        const matchId = event.pathParameters?.matchId;

        if (!ladderId || !matchId) {
            return createResponse(400, { message: 'Ladder ID and Match ID are required' });
        }

        // Parse request body
        if (!event.body) {
            return createResponse(400, { message: 'Request body is required' });
        }

        let parsedBody;
        try {
            parsedBody = JSON.parse(event.body);
        } catch (error) {
            return createResponse(400, { message: 'Invalid JSON format', details: error.message });
        }

        // Validate required fields
        const { scores, winner, isResubmission } = parsedBody;

        if (!scores || !Array.isArray(scores)) {
            return createResponse(400, { message: 'Scores array is required' });
        }

        if (!winner) {
            return createResponse(400, { message: 'Winner ID is required' });
        }

        // Connect to databases
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');
        const matches = db.collection('competitiveMatches');

        // Get ladder and match
        let ladder, match;
        try {
            ladder = await ladders.findOne({ _id: new ObjectId(ladderId) });
            match = await matches.findOne({
                _id: new ObjectId(matchId),
                ladderId: ladderId
            });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ID format' });
        }

        if (!ladder) {
            return createResponse(404, { message: 'Ladder not found' });
        }

        if (!match) {
            return createResponse(404, { message: 'Match not found in this ladder' });
        }

        // Handle resubmission for disputed matches
        if (isResubmission === true && match.status === 'disputed') {
            console.log(`Resubmission requested for disputed match: ${matchId}`);

            // Reset the player's submission state
            const isChallenger = match.challengerId === userId;
            const updateField = isChallenger ? 'challengerSubmitted' : 'challengeeSubmitted';

            // Update match to clear this player's submission
            await matches.updateOne(
                { _id: new ObjectId(matchId) },
                {
                    $set: {
                        [updateField]: false,
                        [`${updateField}At`]: null,
                        [`${updateField}Scores`]: null,
                        [`${updateField}Winner`]: null
                    }
                }
            );

            // Re-fetch the match after update
            match = await matches.findOne({
                _id: new ObjectId(matchId),
                ladderId: ladderId
            });

            console.log(`Reset submission state for ${isChallenger ? 'challenger' : 'challengee'}`);
        }

        // Check if user is a participant
        if (match.challengerId !== userId && match.challengeeId !== userId) {
            return createResponse(403, { message: 'Only match participants can submit results' });
        }

        // Check if match is in accepted status
        if (match.status !== 'accepted') {
            return createResponse(400, { message: 'Can only submit results for accepted matches' });
        }

        // Check if winner is a participant
        if (winner !== match.challengerId && winner !== match.challengeeId) {
            return createResponse(400, { message: 'Winner must be a match participant' });
        }

        // Check if player already submitted
        const isChallenger = match.challengerId === userId;
        const submissionField = isChallenger ? 'challengerSubmitted' : 'challengeeSubmitted';
        const scoresField = isChallenger ? 'challengerSubmittedScores' : 'challengeeSubmittedScores';
        const winnerField = isChallenger ? 'challengerSubmittedWinner' : 'challengeeSubmittedWinner';
        const otherSubmissionField = isChallenger ? 'challengeeSubmitted' : 'challengerSubmitted';
        const otherPlayerId = isChallenger ? match.challengeeId : match.challengerId;

        if (match[submissionField]) {
            return createResponse(400, { message: 'You have already submitted a result' });
        }

        // Update with this submission
        const updateObj = {
            $set: {
                [submissionField]: true,
                [`${submissionField}At`]: new Date(),
                [scoresField]: scores,
                [winnerField]: winner
            }
        };

        await matches.updateOne(
            { _id: new ObjectId(matchId) },
            updateObj
        );

        // Re-fetch the match after update
        match = await matches.findOne({
            _id: new ObjectId(matchId),
            ladderId: ladderId
        });

        // If both players have now submitted
        if (match.challengerSubmitted && match.challengeeSubmitted) {
            console.log(`Match ${matchId}: Both players have submitted results`);

            // Check if submissions match
            const submissionsMatch = (
                JSON.stringify(match.challengerSubmittedScores) === JSON.stringify(match.challengeeSubmittedScores) &&
                match.challengerSubmittedWinner === match.challengeeSubmittedWinner
            );

            if (submissionsMatch) {
                console.log(`Match ${matchId}: Both players submitted matching results`);

                // Update match as completed
                await matches.updateOne(
                    { _id: new ObjectId(matchId) },
                    {
                        $set: {
                            status: 'completed',
                            completedAt: new Date(),
                            scores: match.challengerSubmittedScores, // Can use either player's scores
                            winner: match.challengerSubmittedWinner // Can use either player's winner
                        }
                    }
                );

                // Update ladder positions if challenger won
                if (match.challengerSubmittedWinner === match.challengerId) {
                    await updateLadderPositions(ladder, match.challengerId, match.challengeeId, ladders);
                }

                // Notify both players
                await notifyMatchCompletion(ladder, match, match.challengerSubmittedWinner, token);

                return createResponse(200, {
                    message: 'Match result submitted and verified',
                    status: 'completed',
                    winner: match.challengerSubmittedWinner
                });
            } else {
                console.log(`Match ${matchId}: Players submitted different results, marking as disputed`);

                // Results don't match - set to disputed
                await matches.updateOne(
                    { _id: new ObjectId(matchId) },
                    {
                        $set: {
                            status: 'disputed',
                            disputedAt: new Date()
                            // We already have challengerSubmittedScores, challengeeSubmittedScores, 
                            // challengerSubmittedWinner, challengeeSubmittedWinner stored
                        }
                    }
                );

                // Notify ladder creator
                try {
                    const usersDb = await connectToSpecificDatabase('users-db');
                    const users = usersDb.collection('users');
                    const user = await users.findOne({ _id: new ObjectId(userId) });

                    if (ladder.creatorId !== match.challengerId && ladder.creatorId !== match.challengeeId) {
                        const notificationRequest = {
                            recipientId: ladder.creatorId,
                            senderId: userId,
                            senderName: user?.name || 'Unknown User',
                            ladderId: ladderId,
                            ladderName: ladder.name,
                            matchId: matchId,
                            type: 'match_disputed'
                        };

                        // Make request to your notification API
                        if (process.env.NOTIFICATION_API_URL) {
                            await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/ladders', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify(notificationRequest)
                            });
                        }
                    }
                } catch (notificationError) {
                    console.error('Error sending dispute notification:', notificationError);
                    // Continue without failing
                }

                return createResponse(200, {
                    message: 'Match results do not match other player\'s submission. The match is now disputed.',
                    status: 'disputed'
                });
            }
        } else {
            // Only one player has submitted - waiting for the other player
            console.log(`Match ${matchId}: One player submitted, waiting for other player`);

            // Notify other player
            try {
                const usersDb = await connectToSpecificDatabase('users-db');
                const users = usersDb.collection('users');
                const user = await users.findOne({ _id: new ObjectId(userId) });

                const notificationRequest = {
                    recipientId: otherPlayerId,
                    senderId: userId,
                    senderName: user?.name || 'Unknown User',
                    ladderId: ladderId,
                    ladderName: ladder.name,
                    matchId: matchId,
                    type: 'match_result_submitted'
                };

                // Make request to your notification API
                if (process.env.NOTIFICATION_API_URL) {
                    await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/ladders', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(notificationRequest)
                    });
                }
            } catch (notificationError) {
                console.error('Error sending result submission notification:', notificationError);
                // Continue without failing
            }

            return createResponse(200, {
                message: 'Result submitted successfully. Waiting for other player to confirm.',
                status: 'waiting_confirmation'
            });
        }
    } catch (error) {
        console.error('Submit match result error:', error);
        return createResponse(500, { message: 'Error submitting match result', error: error.message });
    }
}
export async function resetMatchSubmission(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const ladderId = event.pathParameters?.id;
        const matchId = event.pathParameters?.matchId;

        if (!ladderId || !matchId) {
            return createResponse(400, { message: 'Ladder ID and Match ID are required' });
        }

        // Connect to ladders database
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');
        const matches = db.collection('competitiveMatches');

        // Get ladder and match
        let ladder, match;
        try {
            ladder = await ladders.findOne({ _id: new ObjectId(ladderId) });
            match = await matches.findOne({
                _id: new ObjectId(matchId),
                ladderId: ladderId
            });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ID format', details: error.message });
        }

        if (!ladder) {
            return createResponse(404, { message: 'Ladder not found' });
        }

        if (!match) {
            return createResponse(404, { message: 'Match not found in this ladder' });
        }

        // Check if user is a participant
        if (match.challengerId !== userId && match.challengeeId !== userId) {
            return createResponse(403, { message: 'You are not a participant in this match' });
        }

        // Check if the match is in disputed status
        if (match.status !== 'disputed') {
            // Only allow resets for disputed matches
            return createResponse(400, { message: 'Only disputed matches can be reset for resubmission' });
        }

        // Reset submission state for this user
        const isChallenger = match.challengerId === userId;
        const updateField = isChallenger ? 'challengerSubmitted' : 'challengeeSubmitted';

        // Reset this player's submission
        await matches.updateOne(
            { _id: new ObjectId(matchId) },
            {
                $set: {
                    [updateField]: false,
                    [`${updateField}At`]: null
                }
            }
        );

        return createResponse(200, {
            message: 'Match submission state reset successfully',
            match: matchId,
            player: isChallenger ? 'challenger' : 'challengee'
        });
    } catch (error) {
        console.error('Reset match submission error:', error);
        return createResponse(500, { message: 'Error resetting match submission', error: error.message });
    }
}


// Resolve disputed match (ladder creator only)
export async function resolveDisputedMatch(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const ladderId = event.pathParameters?.id;
        const matchId = event.pathParameters?.matchId;

        if (!ladderId || !matchId) {
            return createResponse(400, { message: 'Ladder ID and Match ID are required' });
        }

        // Parse request body
        if (!event.body) {
            return createResponse(400, { message: 'Request body is required' });
        }

        let parsedBody;
        try {
            parsedBody = JSON.parse(event.body);
        } catch (error) {
            return createResponse(400, { message: 'Invalid JSON format', details: error.message });
        }

        // Validate required fields
        const { resolution, scores, winner } = parsedBody;

        if (!resolution || !['accept_challenger', 'accept_challengee', 'custom', 'no_contest'].includes(resolution)) {
            return createResponse(400, { message: 'Valid resolution type is required' });
        }

        if (resolution === 'custom' && (!scores || !winner)) {
            return createResponse(400, { message: 'Scores and winner are required for custom resolution' });
        }

        // Connect to ladders database
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');
        const matches = db.collection('competitiveMatches');

        // Get ladder and match
        let ladder, match;
        try {
            ladder = await ladders.findOne({ _id: new ObjectId(ladderId) });
            match = await matches.findOne({
                _id: new ObjectId(matchId),
                ladderId: ladderId
            });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ID format' });
        }

        if (!ladder) {
            return createResponse(404, { message: 'Ladder not found' });
        }

        if (!match) {
            return createResponse(404, { message: 'Match not found in this ladder' });
        }

        // Check if user is ladder creator
        if (ladder.creatorId !== userId) {
            return createResponse(403, { message: 'Only the ladder creator can resolve disputed matches' });
        }

        // Check if match is disputed
        if (match.status !== 'disputed') {
            return createResponse(400, { message: 'This match is not in a disputed state' });
        }

        // Determine final result
        let finalScores, finalWinner;

        switch (resolution) {
            case 'accept_challenger':
                finalScores = match.challengerSubmittedScores;
                finalWinner = match.challengerSubmittedWinner;
                break;
            case 'accept_challengee':
                finalScores = match.challengeeSubmittedScores;
                finalWinner = match.challengeeSubmittedWinner;
                break;
            case 'custom':
                finalScores = scores;
                finalWinner = winner;
                break;
            case 'no_contest':
                // Mark match as void and notify players
                await matches.updateOne(
                    { _id: new ObjectId(matchId) },
                    {
                        $set: {
                            status: 'cancelled',
                            completedAt: new Date(),
                            resolution: 'no_contest',
                            resolutionNote: 'Match cancelled by ladder administrator'
                        }
                    }
                );

                // Notify both players
                try {
                    const usersDb = await connectToSpecificDatabase('users-db');
                    const users = usersDb.collection('users');
                    const creator = await users.findOne({ _id: new ObjectId(userId) });

                    for (const playerId of [match.challengerId, match.challengeeId]) {
                        const notificationRequest = {
                            recipientId: playerId,
                            senderId: userId,
                            senderName: creator?.name || 'Ladder Administrator',
                            ladderId: ladderId,
                            ladderName: ladder.name,
                            matchId: matchId,
                            type: 'match_cancelled'
                        };

                        // Make request to your notification API
                        if (process.env.NOTIFICATION_API_URL) {
                            await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/ladders', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify(notificationRequest)
                            });
                        }
                    }
                } catch (notificationError) {
                    console.error('Error sending cancellation notifications:', notificationError);
                    // Continue without failing
                }

                return createResponse(200, {
                    message: 'Match has been cancelled',
                    resolution: 'no_contest'
                });
        }

        // Ensure winner is a participant
        if (finalWinner !== match.challengerId && finalWinner !== match.challengeeId) {
            return createResponse(400, { message: 'Winner must be a match participant' });
        }

        // Update match with resolution
        await matches.updateOne(
            { _id: new ObjectId(matchId) },
            {
                $set: {
                    status: 'completed',
                    completedAt: new Date(),
                    scores: finalScores,
                    winner: finalWinner,
                    resolution: resolution,
                    resolvedBy: userId
                }
            }
        );

        // Update ladder positions if challenger won
        if (finalWinner === match.challengerId) {
            await updateLadderPositions(ladder, match.challengerId, match.challengeeId, ladders);
        }

        // Notify both players
        await notifyMatchCompletion(ladder, match, finalWinner, token);

        return createResponse(200, {
            message: 'Disputed match has been resolved',
            resolution: resolution,
            winner: finalWinner
        });
    } catch (error) {
        console.error('Resolve disputed match error:', error);
        return createResponse(500, { message: 'Error resolving disputed match', error: error.message });
    }
}

// Leave ladder
export async function leaveLadder(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const ladderId = event.pathParameters?.id;

        if (!ladderId) {
            return createResponse(400, { message: 'Ladder ID is required' });
        }

        // Connect to ladders database
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');
        const matches = db.collection('competitiveMatches');

        // Get ladder
        let ladder;
        try {
            ladder = await ladders.findOne({ _id: new ObjectId(ladderId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ladder ID format' });
        }

        if (!ladder) {
            return createResponse(404, { message: 'Ladder not found' });
        }

        // Check if user is in ladder
        const playerPosition = ladder.positions.find(pos => pos.playerId === userId);
        if (!playerPosition) {
            return createResponse(400, { message: 'You are not participating in this ladder' });
        }

        // Check if user is creator
        if (ladder.creatorId === userId) {
            return createResponse(400, { message: 'The ladder creator cannot leave the ladder. You may close the ladder instead.' });
        }

        // Check for active challenges
        const activeChallenge = await matches.findOne({
            ladderId: ladderId,
            $or: [
                { challengerId: userId },
                { challengeeId: userId }
            ],
            status: { $in: ['scheduled', 'accepted'] }
        });

        if (activeChallenge) {
            return createResponse(400, { message: 'You have active challenges. Please complete or cancel them before leaving.' });
        }

        // Remove player from positions
        const playerRank = playerPosition.rank;
        await ladders.updateOne(
            { _id: new ObjectId(ladderId) },
            { $pull: { positions: { playerId: userId } } }
        );

        // Update ranks for players below
        await ladders.updateMany(
            {
                _id: new ObjectId(ladderId),
                "positions.rank": { $gt: playerRank }
            },
            { $inc: { "positions.$[elem].rank": -1 } },
            { arrayFilters: [{ "elem.rank": { $gt: playerRank } }] }
        );

        // Notify ladder creator
        try {
            if (ladder.creatorId !== userId) {
                const usersDb = await connectToSpecificDatabase('users-db');
                const users = usersDb.collection('users');
                const user = await users.findOne({ _id: new ObjectId(userId) });

                const notificationRequest = {
                    recipientId: ladder.creatorId,
                    senderId: userId,
                    senderName: user?.name || 'Unknown User',
                    ladderId: ladderId,
                    ladderName: ladder.name,
                    type: 'ladder_leave'
                };

                // Make request to your notification API
                if (process.env.NOTIFICATION_API_URL) {
                    await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/ladders', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(notificationRequest)
                    });
                }
            }
        } catch (notificationError) {
            console.error('Error sending leave notification:', notificationError);
            // Continue without failing
        }

        return createResponse(200, { message: 'Successfully left ladder' });
    } catch (error) {
        console.error('Leave ladder error:', error);
        return createResponse(500, { message: 'Error leaving ladder', error: error.message });
    }
}

// Helper function to update ladder positions
async function updateLadderPositions(ladder, challengerId, challengeeId, laddersCollection) {
    try {
        // Get the positions
        const challengerPos = ladder.positions.find(pos => pos.playerId === challengerId);
        const challengeePos = ladder.positions.find(pos => pos.playerId === challengeeId);

        if (!challengerPos || !challengeePos) {
            console.error('Cannot find positions for players');
            return;
        }

        const challengerRank = challengerPos.rank;
        const challengeeRank = challengeePos.rank;

        // If positions are not adjacent, update all positions in between
        if (challengerRank - challengeeRank > 1) {
            // Update players between challenger and challengee
            for (let i = challengeeRank + 1; i < challengerRank; i++) {
                await laddersCollection.updateOne(
                    {
                        _id: ladder._id,
                        "positions.rank": i
                    },
                    { $inc: { "positions.$.rank": 1 } }
                );
            }
        }

        // Update challenger and challengee positions
        await laddersCollection.updateOne(
            {
                _id: ladder._id,
                "positions.playerId": challengerId
            },
            { $set: { "positions.$.rank": challengeeRank } }
        );

        await laddersCollection.updateOne(
            {
                _id: ladder._id,
                "positions.playerId": challengeeId
            },
            { $set: { "positions.$.rank": challengeeRank + 1 } }
        );
    } catch (error) {
        console.error('Error updating ladder positions:', error);
        throw error;
    }
}

// Helper function to notify players of match completion
async function notifyMatchCompletion(ladder, match, winner, token) {
    try {
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Get user details
        const winnerDetails = await users.findOne({ _id: new ObjectId(winner) });
        const loserId = winner === match.challengerId ? match.challengeeId : match.challengerId;

        // Notify both players
        for (const playerId of [match.challengerId, match.challengeeId]) {
            const isWinner = playerId === winner;

            const notificationRequest = {
                recipientId: playerId,
                senderId: isWinner ? loserId : winner,
                senderName: isWinner ? 'Ladder System' : (winnerDetails?.name || 'Your Opponent'),
                ladderId: ladder._id.toString(),
                ladderName: ladder.name,
                matchId: match._id.toString(),
                type: 'match_completed',
                isWinner: isWinner,
                rankChange: isWinner && winner === match.challengerId ? match.challengeeRank - match.challengerRank : 0
            };

            // Make request to your notification API
            if (process.env.NOTIFICATION_API_URL) {
                await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/ladders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(notificationRequest)
                });
            }
        }
    } catch (notificationError) {
        console.error('Error sending match completion notifications:', notificationError);
        // Continue without failing
    }
}

// Invite a user to a ladder
export async function inviteToLadder(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const inviterId = token.decoded.userId;
        const ladderId = event.pathParameters?.id;

        if (!ladderId) {
            return createResponse(400, { message: 'Ladder ID is required' });
        }

        // Parse request body
        if (!event.body) {
            return createResponse(400, { message: 'Request body is required' });
        }

        let parsedBody;
        try {
            parsedBody = JSON.parse(event.body);
        } catch (error) {
            return createResponse(400, { message: 'Invalid JSON format', details: error.message });
        }

        // Validate required fields
        const { inviteeId } = parsedBody;

        if (!inviteeId) {
            return createResponse(400, { message: 'Invitee ID is required' });
        }

        // Connect to databases
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');
        const invitations = db.collection('ladderInvitations');

        // Check if ladder exists and is valid to invite to
        let ladder;
        try {
            ladder = await ladders.findOne({ _id: new ObjectId(ladderId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ladder ID format' });
        }

        if (!ladder) {
            return createResponse(404, { message: 'Ladder not found' });
        }

        // Check if user is the creator or has permission to invite
        if (ladder.creatorId !== inviterId) {
            return createResponse(403, { message: 'Only the ladder creator can send invitations' });
        }

        // Check if ladder is active
        if (ladder.status !== 'active') {
            return createResponse(400, { message: 'Cannot invite to a ladder that is not active' });
        }

        // Check if invitee exists
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        let invitee;
        try {
            invitee = await users.findOne({ _id: new ObjectId(inviteeId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid invitee ID format' });
        }

        if (!invitee) {
            return createResponse(404, { message: 'Invitee not found' });
        }

        // Check if user is already in the ladder
        if (ladder.positions.some(pos => pos.playerId === inviteeId)) {
            return createResponse(400, { message: 'User is already participating in this ladder' });
        }

        // Check if invitation already exists
        const existingInvitation = await invitations.findOne({
            ladderId: ladderId,
            inviteeId: inviteeId,
            status: 'pending'
        });

        if (existingInvitation) {
            return createResponse(400, { message: 'Invitation already sent to this user' });
        }

        // Create invitation
        const invitation = {
            ladderId: ladderId,
            ladderName: ladder.name,
            inviterId: inviterId,
            inviterName: (await users.findOne({ _id: new ObjectId(inviterId) }))?.name || 'Unknown',
            inviteeId: inviteeId,
            inviteeName: invitee.name,
            status: 'pending',
            createdAt: new Date()
        };

        const result = await invitations.insertOne(invitation);
        const invitationId = result.insertedId.toString();

        // Send notification
        try {
            if (process.env.NOTIFICATION_API_URL) {
                const notificationRequest = {
                    recipientId: inviteeId,
                    senderId: inviterId,
                    senderName: invitation.inviterName,
                    ladderId: ladderId,
                    ladderName: ladder.name,
                    type: 'ladder_invitation',
                    content: `You have been invited to join the ladder: ${ladder.name}`,
                    relatedItemId: invitationId
                };

                await fetch(process.env.NOTIFICATION_API_URL + '/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(notificationRequest)
                });
            }
        } catch (notificationError) {
            console.error('Error sending invitation notification:', notificationError);
            // Continue without failing the invitation creation
        }

        return createResponse(201, {
            message: 'Invitation sent successfully',
            invitationId: invitationId,
            invitation: {
                ...invitation,
                id: invitationId
            }
        });
    } catch (error) {
        console.error('Invite to ladder error:', error);
        return createResponse(500, { message: 'Error sending ladder invitation', error: error.message });
    }
}


// Get sent ladder invitations for a specific ladder

async function auditMatchState(match, operation, userId, db) {
    try {
        // Create an audit collection if you want to track these issues
        const audits = db.collection('matchAudits');

        // Check for inconsistent state
        const issues = [];

        // 1. Check if match is marked completed but only one player submitted
        if (match.status === 'completed' &&
            ((!match.player1Submitted && match.player2Submitted) ||
                (match.player1Submitted && !match.player2Submitted))) {
            issues.push('Match marked completed but only one player submitted');

            // Auto-fix this issue
            await db.collection('competitiveMatches').updateOne(
                { _id: match._id },
                {
                    $set: {
                        status: 'disputed',
                        winner: null,
                        completedAt: null
                    }
                }
            );
        }

        // 2. Check if winner is set but no scores are recorded
        if (match.winner && (!match.scores || match.scores.length === 0)) {
            issues.push('Winner set but no scores recorded');
        }

        // 3. Check for player mismatch - winner isn't player1 or player2
        if (match.winner &&
            match.winner !== match.player1 &&
            match.winner !== match.player2 &&
            match.winner !== match.challengerId &&
            match.winner !== match.challengeeId) {
            issues.push('Winner is not a match participant');
        }

        // 4. If time permits, call this at the START of submitMatchResult
        // to check for and fix any improper state before processing

        // Log issues if found
        if (issues.length > 0) {
            console.error(`Match state issues found for match ${match._id}:`, issues);

            // Save audit record
            await audits.insertOne({
                matchId: match._id.toString(),
                operation: operation,
                userId: userId,
                issues: issues,
                timestamp: new Date(),
                matchState: match
            });

            return {
                hasIssues: true,
                issues: issues
            };
        }

        return { hasIssues: false };
    } catch (error) {
        console.error('Error in match state audit:', error);
        return { hasIssues: false }; // Don't block operation on audit failure
    }
}

// Complete implementation for ladder invitations in ladders.mjs

// Accept ladder invitation
export async function acceptLadderInvitation(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const invitationId = event.pathParameters?.invitationId;

        if (!invitationId) {
            return createResponse(400, { message: 'Invitation ID is required' });
        }

        // Connect to databases
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');
        const invitations = db.collection('ladderInvitations');

        // Get invitation
        let invitation;
        try {
            invitation = await invitations.findOne({ _id: new ObjectId(invitationId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid invitation ID format' });
        }

        if (!invitation) {
            return createResponse(404, { message: 'Invitation not found' });
        }

        // Check if the user is the invitee
        if (invitation.inviteeId !== userId) {
            return createResponse(403, { message: 'You can only accept your own invitations' });
        }

        // Check if invitation is pending
        if (invitation.status !== 'pending') {
            return createResponse(400, { message: 'This invitation has already been processed' });
        }

        // Check if ladder exists and is active
        let ladder;
        try {
            ladder = await ladders.findOne({ _id: new ObjectId(invitation.ladderId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ladder ID format' });
        }

        if (!ladder) {
            await invitations.updateOne(
                { _id: new ObjectId(invitationId) },
                { $set: { status: 'cancelled', updatedAt: new Date() } }
            );
            return createResponse(404, { message: 'Ladder no longer exists' });
        }

        // Check if ladder is active
        if (ladder.status !== 'active') {
            await invitations.updateOne(
                { _id: new ObjectId(invitationId) },
                { $set: { status: 'expired', updatedAt: new Date() } }
            );
            return createResponse(400, { message: 'Ladder is no longer active' });
        }

        // Update invitation status
        await invitations.updateOne(
            { _id: new ObjectId(invitationId) },
            { $set: { status: 'accepted', updatedAt: new Date() } }
        );

        // Add user to ladder by calling the join ladder function internally
        const newRank = ladder.positions.length + 1;
        await ladders.updateOne(
            { _id: new ObjectId(invitation.ladderId) },
            { $push: { positions: { rank: newRank, playerId: userId } } }
        );

        // Get user details
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');
        const user = await users.findOne({ _id: new ObjectId(userId) });

        // Send notification to ladder creator
        try {
            if (process.env.NOTIFICATION_API_URL) {
                const notificationRequest = {
                    recipientId: invitation.inviterId,
                    senderId: userId,
                    senderName: invitation.inviteeName,
                    ladderId: invitation.ladderId,
                    ladderName: invitation.ladderName,
                    type: 'ladder_invitation_accepted',
                    content: `${invitation.inviteeName} has accepted your invitation to join ${invitation.ladderName}`,
                    relatedItemId: invitation.ladderId
                };

                await fetch(process.env.NOTIFICATION_API_URL + '/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(notificationRequest)
                });
            }
        } catch (notificationError) {
            console.error('Error sending invitation acceptance notification:', notificationError);
        }

        return createResponse(200, {
            message: 'Ladder invitation accepted successfully',
            ladderId: invitation.ladderId,
            ladderName: invitation.ladderName,
            userRank: newRank
        });
    } catch (error) {
        console.error('Accept ladder invitation error:', error);
        return createResponse(500, { message: 'Error accepting ladder invitation', error: error.message });
    }
}

// Reject ladder invitation
export async function rejectLadderInvitation(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const invitationId = event.pathParameters?.invitationId;

        if (!invitationId) {
            return createResponse(400, { message: 'Invitation ID is required' });
        }

        // Connect to database
        const db = await connectToDatabase();
        const invitations = db.collection('ladderInvitations');

        // Get invitation
        let invitation;
        try {
            invitation = await invitations.findOne({ _id: new ObjectId(invitationId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid invitation ID format' });
        }

        if (!invitation) {
            return createResponse(404, { message: 'Invitation not found' });
        }

        // Check if the user is the invitee
        if (invitation.inviteeId !== userId) {
            return createResponse(403, { message: 'You can only reject your own invitations' });
        }

        // Check if invitation is pending
        if (invitation.status !== 'pending') {
            return createResponse(400, { message: 'This invitation has already been processed' });
        }

        // Update invitation status
        await invitations.updateOne(
            { _id: new ObjectId(invitationId) },
            { $set: { status: 'rejected', updatedAt: new Date() } }
        );

        // Send notification to ladder creator
        try {
            if (process.env.NOTIFICATION_API_URL) {
                const notificationRequest = {
                    recipientId: invitation.inviterId,
                    senderId: userId,
                    senderName: invitation.inviteeName,
                    ladderId: invitation.ladderId,
                    ladderName: invitation.ladderName,
                    type: 'ladder_invitation_rejected',
                    content: `${invitation.inviteeName} has declined your invitation to join ${invitation.ladderName}`,
                    relatedItemId: invitation.ladderId
                };

                await fetch(process.env.NOTIFICATION_API_URL + '/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(notificationRequest)
                });
            }
        } catch (notificationError) {
            console.error('Error sending invitation rejection notification:', notificationError);
        }

        return createResponse(200, {
            message: 'Ladder invitation rejected successfully'
        });
    } catch (error) {
        console.error('Reject ladder invitation error:', error);
        return createResponse(500, { message: 'Error rejecting ladder invitation', error: error.message });
    }
}

// Cancel ladder invitation (for ladder creators to cancel a pending invitation)
export async function cancelLadderInvitation(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const invitationId = event.pathParameters?.invitationId;

        if (!invitationId) {
            return createResponse(400, { message: 'Invitation ID is required' });
        }

        // Connect to database
        const db = await connectToDatabase();
        const invitations = db.collection('ladderInvitations');
        const ladders = db.collection('ladders');

        // Get invitation
        let invitation;
        try {
            invitation = await invitations.findOne({ _id: new ObjectId(invitationId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid invitation ID format' });
        }

        if (!invitation) {
            return createResponse(404, { message: 'Invitation not found' });
        }

        // Check if ladder exists
        let ladder;
        try {
            ladder = await ladders.findOne({ _id: new ObjectId(invitation.ladderId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ladder ID format' });
        }

        if (!ladder) {
            return createResponse(404, { message: 'Ladder not found' });
        }

        // Check if user is the ladder creator
        if (ladder.creatorId !== userId) {
            return createResponse(403, { message: 'Only the ladder creator can cancel invitations' });
        }

        // Check if invitation is pending
        if (invitation.status !== 'pending') {
            return createResponse(400, { message: 'This invitation has already been processed' });
        }

        // Update invitation status
        await invitations.updateOne(
            { _id: new ObjectId(invitationId) },
            { $set: { status: 'cancelled', updatedAt: new Date() } }
        );

        // Send notification to invitee
        try {
            if (process.env.NOTIFICATION_API_URL) {
                const notificationRequest = {
                    recipientId: invitation.inviteeId,
                    senderId: userId,
                    senderName: invitation.inviterName,
                    ladderId: invitation.ladderId,
                    ladderName: invitation.ladderName,
                    type: 'ladder_invitation_cancelled',
                    content: `Your invitation to join ${invitation.ladderName} has been cancelled`,
                    relatedItemId: invitation.ladderId
                };

                await fetch(process.env.NOTIFICATION_API_URL + '/notifications', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(notificationRequest)
                });
            }
        } catch (notificationError) {
            console.error('Error sending invitation cancellation notification:', notificationError);
        }

        return createResponse(200, {
            message: 'Ladder invitation cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel ladder invitation error:', error);
        return createResponse(500, { message: 'Error cancelling ladder invitation', error: error.message });
    }
}

// Get pending ladder invitations for a user
export async function getPendingLadderInvitations(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;

        // Connect to database
        const db = await connectToDatabase();
        const invitations = db.collection('ladderInvitations');

        // Get pending invitations for the user
        const pendingInvitations = await invitations.find({
            inviteeId: userId,
            status: 'pending'
        }).sort({ createdAt: -1 }).toArray();

        return createResponse(200, {
            invitations: pendingInvitations.map(invitation => ({
                ...invitation,
                id: invitation._id.toString()
            }))
        });
    } catch (error) {
        console.error('Get pending ladder invitations error:', error);
        return createResponse(500, { message: 'Error retrieving pending ladder invitations', error: error.message });
    }
}

// Get sent ladder invitations for a specific ladder
export async function getSentLadderInvitations(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const ladderId = event.pathParameters?.id;

        if (!ladderId) {
            return createResponse(400, { message: 'Ladder ID is required' });
        }

        // Connect to databases
        const db = await connectToDatabase();
        const ladders = db.collection('ladders');
        const invitations = db.collection('ladderInvitations');

        // Check if ladder exists
        let ladder;
        try {
            ladder = await ladders.findOne({ _id: new ObjectId(ladderId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ladder ID format' });
        }

        if (!ladder) {
            return createResponse(404, { message: 'Ladder not found' });
        }

        // Check if user is the creator or has permission to view invitations
        if (ladder.creatorId !== userId) {
            return createResponse(403, { message: 'Only the ladder creator can view sent invitations' });
        }

        // Get all invitations for this ladder
        const ladderInvitations = await invitations.find({
            ladderId: ladderId
        }).sort({ createdAt: -1 }).toArray();

        return createResponse(200, {
            invitations: ladderInvitations.map(invitation => ({
                ...invitation,
                id: invitation._id.toString()
            }))
        });
    } catch (error) {
        console.error('Get sent ladder invitations error:', error);
        return createResponse(500, { message: 'Error retrieving sent ladder invitations', error: error.message });
    }
}

// Get all ladder invitations for the current user
export async function getAllLadderInvitations(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;

        // Connect to database
        const db = await connectToDatabase();
        const invitations = db.collection('ladderInvitations');

        // Get all invitations for the user (as invitee)
        const allInvitations = await invitations.find({
            inviteeId: userId
        }).sort({ createdAt: -1 }).toArray();

        return createResponse(200, {
            invitations: allInvitations.map(invitation => ({
                ...invitation,
                id: invitation._id.toString()
            }))
        });
    } catch (error) {
        console.error('Get all ladder invitations error:', error);
        return createResponse(500, { message: 'Error retrieving ladder invitations', error: error.message });
    }
}
// Helper function to extract and verify JWT token
function extractAndVerifyToken(event) {
    const authHeader = event.headers.Authorization ||
        event.headers.authorization ||
        event.headers['Authorization'] ||
        event.headers['authorization'];

    if (!authHeader) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'No authorization token provided' })
        };
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid authorization format' })
        };
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return {
            isValid: true,
            decoded
        };
    } catch (error) {
        return {
            isValid: false,
            response: createResponse(401, { message: 'Invalid token' })
        };
    }
}

