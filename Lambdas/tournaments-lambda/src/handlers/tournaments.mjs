import jwt from 'jsonwebtoken';
import { connectToDatabase, connectToSpecificDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';
import fetch from 'node-fetch';

// Get all tournaments
export async function getTournaments(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        console.log('Getting tournaments for user:', userId);

        // Check if we want only user's tournaments
        const queryParams = event.queryStringParameters || {};
        const onlyUserTournaments = queryParams.personal === 'true';

        // Connect to tournaments database
        const db = await connectToDatabase();
        const tournaments = db.collection('tournaments');

        // Build query
        const query = {};

        // Filter by user if personal flag is set
        if (onlyUserTournaments) {
            query.$or = [
                { creatorId: userId },
                { players: userId }
            ];
        }

        // Filter by visibility if not personal
        if (!onlyUserTournaments) {
            query.visibility = 'public';
        }

        // Filter by status if provided
        if (queryParams.status) {
            query.status = queryParams.status;
        }

        // Filter by format if provided
        if (queryParams.format) {
            query.format = queryParams.format;
        }

        console.log('Query:', JSON.stringify(query));

        // Get tournaments
        const tournamentList = await tournaments.find(query)
            .sort({ createdAt: -1 })
            .toArray();

        console.log(`Found ${tournamentList.length} tournaments`);

        // Connect to users database to get creator and player details
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Get unique user IDs from tournaments
        const userIds = new Set();
        tournamentList.forEach(tournament => {
            if (tournament.creatorId) userIds.add(tournament.creatorId);
            if (tournament.players && Array.isArray(tournament.players)) {
                tournament.players.forEach(playerId => userIds.add(playerId));
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

        // Enhance tournament data with user details
        const enhancedTournaments = tournamentList.map(tournament => {
            // Enhance with creator details
            let enhancedTournament = {
                ...tournament,
                id: tournament._id.toString(),
                creatorDetails: tournament.creatorId && userLookup[tournament.creatorId]
                    ? userLookup[tournament.creatorId]
                    : { name: 'Unknown User', playerLevel: 'Beginner' }
            };

            // Enhance with player details if available
            if (tournament.players && Array.isArray(tournament.players)) {
                enhancedTournament.playerDetails = tournament.players.map(playerId => {
                    return {
                        id: playerId,
                        ...userLookup[playerId] || { name: 'Unknown User', playerLevel: 'Beginner' }
                    };
                });
            }

            return enhancedTournament;
        });

        return createResponse(200, { tournaments: enhancedTournaments });
    } catch (error) {
        console.error('Get tournaments error:', error);
        return createResponse(500, { message: 'Error retrieving tournaments', error: error.message });
    }
}

// Get tournament by ID
export async function getTournamentById(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const tournamentId = event.pathParameters?.id;

        if (!tournamentId) {
            return createResponse(400, { message: 'Tournament ID is required' });
        }

        console.log(`Getting tournament ${tournamentId} for user ${userId}`);

        // Connect to tournaments database
        const db = await connectToDatabase();
        const tournaments = db.collection('tournaments');
        const matches = db.collection('competitiveMatches');

        // Get tournament
        let tournament;
        try {
            tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
        } catch (error) {
            console.error('Invalid tournament ID format:', error);
            return createResponse(400, { message: 'Invalid tournament ID format' });
        }

        if (!tournament) {
            return createResponse(404, { message: 'Tournament not found' });
        }

        // Check if the tournament is private and the user is not the creator or a player
        if (tournament.visibility === 'private' &&
            tournament.creatorId !== userId &&
            !tournament.players.includes(userId)) {
            return createResponse(403, { message: 'You do not have access to this tournament' });
        }

        // Connect to users database to get creator and player details
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Get unique user IDs from tournament
        const userIds = new Set();
        if (tournament.creatorId) userIds.add(tournament.creatorId);
        if (tournament.players && Array.isArray(tournament.players)) {
            tournament.players.forEach(playerId => userIds.add(playerId));
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

        // Get tournament matches
        const tournamentMatches = await matches.find({
            tournamentId: tournamentId
        }).toArray();

        // Enhance tournament with user details and matches
        const enhancedTournament = {
            ...tournament,
            id: tournament._id.toString(),
            creatorDetails: tournament.creatorId && userLookup[tournament.creatorId]
                ? userLookup[tournament.creatorId]
                : { name: 'Unknown User', playerLevel: 'Beginner' },
            playerDetails: tournament.players && Array.isArray(tournament.players)
                ? tournament.players.map(playerId => userLookup[playerId] || {
                    id: playerId,
                    name: 'Unknown User',
                    playerLevel: 'Beginner'
                })
                : [],
            matches: tournamentMatches.map(match => ({
                ...match,
                id: match._id.toString()
            }))
        };

        return createResponse(200, { tournament: enhancedTournament });
    } catch (error) {
        console.error('Get tournament by ID error:', error);
        return createResponse(500, { message: 'Error retrieving tournament', error: error.message });
    }
}

// Create tournament
export async function createTournament(event) {
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
        const { name, format, visibility, challengeWindow, skillLevel } = parsedBody;

        if (!name) {
            return createResponse(400, { message: 'Tournament name is required' });
        }

        if (!format || !['single', 'double'].includes(format)) {
            return createResponse(400, { message: 'Valid tournament format (single/double) is required' });
        }

        if (!visibility || !['public', 'private'].includes(visibility)) {
            return createResponse(400, { message: 'Valid visibility (public/private) is required' });
        }

        if (!challengeWindow || isNaN(parseInt(challengeWindow))) {
            return createResponse(400, { message: 'Challenge window (hours) is required' });
        }

        // Connect to tournaments database
        const db = await connectToDatabase();
        const tournaments = db.collection('tournaments');

        // Create new tournament
        const newTournament = {
            name,
            format,
            visibility,
            challengeWindow: parseInt(challengeWindow),
            skillLevel: skillLevel || 'All Levels',
            status: 'pending',
            creatorId,
            players: [creatorId],  // Creator is automatically added as a player
            createdAt: new Date(),
            startedAt: null,
            completedAt: null,
            bracket: null  // Will be generated when the tournament starts
        };

        // Insert tournament
        const result = await tournaments.insertOne(newTournament);
        const tournamentId = result.insertedId.toString();

        // Get creator details from users database
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        const creator = await users.findOne({ _id: new ObjectId(creatorId) });

        // Return the created tournament with creator details
        return createResponse(201, {
            message: 'Tournament created successfully',
            tournament: {
                ...newTournament,
                id: tournamentId,
                creatorDetails: {
                    name: creator?.name || 'Unknown User',
                    playerLevel: creator?.playerLevel || 'Beginner'
                }
            }
        });
    } catch (error) {
        console.error('Create tournament error:', error);
        return createResponse(500, { message: 'Error creating tournament', error: error.message });
    }
}

// Join tournament
export async function joinTournament(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const tournamentId = event.pathParameters?.id;

        if (!tournamentId) {
            return createResponse(400, { message: 'Tournament ID is required' });
        }

        // Connect to tournaments database
        const db = await connectToDatabase();
        const tournaments = db.collection('tournaments');

        // Get tournament
        let tournament;
        try {
            tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid tournament ID format' });
        }

        if (!tournament) {
            return createResponse(404, { message: 'Tournament not found' });
        }

        // Check if tournament has already started
        if (tournament.status !== 'pending') {
            return createResponse(400, { message: 'Cannot join tournament that has already started' });
        }

        // Check if user is already in tournament
        if (tournament.players.includes(userId)) {
            return createResponse(400, { message: 'You are already participating in this tournament' });
        }

        // Update tournament by adding player
        await tournaments.updateOne(
            { _id: new ObjectId(tournamentId) },
            { $push: { players: userId } }
        );

        // Get user details
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');
        const user = await users.findOne({ _id: new ObjectId(userId) });

        // Notify tournament creator
        try {
            if (tournament.creatorId !== userId) {
                const notificationRequest = {
                    recipientId: tournament.creatorId,
                    senderId: userId,
                    senderName: user?.name || 'Unknown User',
                    tournamentId: tournamentId,
                    tournamentName: tournament.name,
                    type: 'tournament_join'
                };

                // Make request to your notification API
                if (process.env.NOTIFICATION_API_URL) {
                    await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/tournaments', {
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
            message: 'Successfully joined tournament',
            userDetails: {
                id: userId,
                name: user?.name || 'Unknown User',
                playerLevel: user?.playerLevel || 'Beginner'
            }
        });
    } catch (error) {
        console.error('Join tournament error:', error);
        return createResponse(500, { message: 'Error joining tournament', error: error.message });
    }
}

// Start tournament
export async function startTournament(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const tournamentId = event.pathParameters?.id;

        if (!tournamentId) {
            return createResponse(400, { message: 'Tournament ID is required' });
        }

        // Connect to tournaments database
        const db = await connectToDatabase();
        const tournaments = db.collection('tournaments');
        const matches = db.collection('competitiveMatches');

        // Get tournament
        let tournament;
        try {
            tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid tournament ID format' });
        }

        if (!tournament) {
            return createResponse(404, { message: 'Tournament not found' });
        }

        // Check if user is the creator
        if (tournament.creatorId !== userId) {
            return createResponse(403, { message: 'Only the tournament creator can start the tournament' });
        }

        // Check if tournament is in pending status
        if (tournament.status !== 'pending') {
            return createResponse(400, { message: 'Tournament has already started or is completed' });
        }

        // Check if there are enough players
        if (!tournament.players || tournament.players.length < 2) {
            return createResponse(400, { message: 'Tournament needs at least 2 players to start' });
        }

        // Generate bracket
        const bracket = generateBracket(tournament.players, tournament.format);

        // Create initial matches
        const initialMatches = [];
        for (const matchInfo of bracket.initialMatches) {
            // Only create matches where both players are defined (not byes)
            if (matchInfo.player1 && matchInfo.player2) {
                const matchDeadline = new Date();
                matchDeadline.setHours(matchDeadline.getHours() + tournament.challengeWindow);

                const match = {
                    tournamentId: tournamentId,
                    matchNumber: matchInfo.matchNumber,
                    round: matchInfo.round,
                    player1: matchInfo.player1,
                    player2: matchInfo.player2,
                    winner: null,
                    scores: [],
                    status: 'scheduled',
                    createdAt: new Date(),
                    deadline: matchDeadline,
                    player1Submitted: false,
                    player2Submitted: false
                };

                initialMatches.push(match);
            }
        }

        // Insert all initial matches
        let createdMatches = [];
        if (initialMatches.length > 0) {
            const result = await matches.insertMany(initialMatches);
            createdMatches = Object.values(result.insertedIds).map(id => id.toString());
        }

        // Update tournament
        await tournaments.updateOne(
            { _id: new ObjectId(tournamentId) },
            {
                $set: {
                    status: 'active',
                    startedAt: new Date(),
                    bracket: bracket.bracketStructure
                }
            }
        );

        // Notify all players
        try {
            const usersDb = await connectToSpecificDatabase('users-db');
            const users = usersDb.collection('users');

            // Get creator details
            const creator = await users.findOne({ _id: new ObjectId(userId) });

            // Notify each player except the creator
            for (const playerId of tournament.players) {
                if (playerId !== userId) {
                    const notificationRequest = {
                        recipientId: playerId,
                        senderId: userId,
                        senderName: creator?.name || 'Tournament Creator',
                        tournamentId: tournamentId,
                        tournamentName: tournament.name,
                        type: 'tournament_started'
                    };

                    // Make request to your notification API
                    if (process.env.NOTIFICATION_API_URL) {
                        await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/tournaments', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify(notificationRequest)
                        });
                    }
                }
            }
        } catch (notificationError) {
            console.error('Error sending tournament start notifications:', notificationError);
            // Continue without failing
        }

        return createResponse(200, {
            message: 'Tournament started successfully',
            bracket: bracket.bracketStructure,
            matches: createdMatches
        });
    } catch (error) {
        console.error('Start tournament error:', error);
        return createResponse(500, { message: 'Error starting tournament', error: error.message });
    }
}

// Submit match result
export async function submitMatchResult(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const tournamentId = event.pathParameters?.id;
        const matchId = event.pathParameters?.matchId;

        if (!tournamentId || !matchId) {
            return createResponse(400, { message: 'Tournament ID and Match ID are required' });
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

        // Connect to tournaments database
        const db = await connectToDatabase();
        const tournaments = db.collection('tournaments');
        const matches = db.collection('competitiveMatches');

        // Get tournament and match
        let tournament, match;
        try {
            tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
            match = await matches.findOne({ _id: new ObjectId(matchId), tournamentId: tournamentId });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ID format', details: error.message });
        }

        // Handle resubmission for disputed matches
        if (isResubmission === true && match.status === 'disputed') {
            console.log(`Resubmission requested for disputed match: ${matchId}`);

            // Reset the player's submission state
            const isPlayer1 = match.player1 === userId;
            const updateField = isPlayer1 ? 'player1Submitted' : 'player2Submitted';

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
                tournamentId: tournamentId
            });

            console.log(`Reset submission state for ${isPlayer1 ? 'player1' : 'player2'}`);
        }

        if (!tournament) {
            return createResponse(404, { message: 'Tournament not found' });
        }

        if (!match) {
            return createResponse(404, { message: 'Match not found in this tournament' });
        }

        // Check if this is a resubmission for a disputed match
        if (isResubmission && match.status === 'disputed') {
            await matches.updateOne(
                { _id: new ObjectId(matchId) },
                {
                    $set: {
                        status: 'scheduled',
                        player1Submitted: false,
                        player2Submitted: false,
                        submittedScores: null,
                        submittedWinner: null,
                        player1Scores: null,
                        player2Scores: null,
                        player1Winner: null,
                        player2Winner: null
                    }
                }
            );
        }

        // Check if tournament is active
        if (tournament.status !== 'active') {
            return createResponse(400, { message: 'Tournament is not active' });
        }

        // Check if user is a participant in the match
        if (match.player1 !== userId && match.player2 !== userId) {
            return createResponse(403, { message: 'You are not a participant in this match' });
        }

        // Check if the match has already been completed
        if (match.status === 'completed') {
            return createResponse(400, { message: 'This match has already been completed' });
        }

        // Check if user has already submitted a result
        const isPlayer1 = match.player1 === userId;
        if ((isPlayer1 && match.player1Submitted) || (!isPlayer1 && match.player2Submitted)) {
            return createResponse(400, { message: 'You have already submitted a result for this match' });
        }

        // Determine which submission field to update
        const updateField = isPlayer1 ? 'player1Submitted' : 'player2Submitted';
        const otherPlayerSubmitted = isPlayer1 ? match.player2Submitted : match.player1Submitted;
        const otherPlayerId = isPlayer1 ? match.player2 : match.player1;

        // Update the match with this player's submission
        const updateObj = {
            $set: {
                [updateField]: true
            }
        };

        // If this is the first submission, save the scores and winner
        if (!match.player1Submitted && !match.player2Submitted) {
            updateObj.$set.submittedScores = scores;
            updateObj.$set.submittedWinner = winner;
        }

        await matches.updateOne(
            { _id: new ObjectId(matchId) },
            updateObj
        );

        // If both players have now submitted
        if (otherPlayerSubmitted) {
            // Compare submissions
            const submissionsMatch = compareSubmissions(match.submittedScores, scores, match.submittedWinner, winner);

            if (submissionsMatch) {
                // Update match as completed with agreed results
                await matches.updateOne(
                    { _id: new ObjectId(matchId) },
                    {
                        $set: {
                            status: 'completed',
                            scores: scores,
                            winner: winner,
                            completedAt: new Date()
                        }
                    }
                );

                // Advance the winner to the next round
                await advanceWinner(tournamentId, match, winner, tournaments, matches);

                return createResponse(200, {
                    message: 'Match result submitted and verified. Winner has advanced.',
                    status: 'completed',
                    winner: winner
                });
            } else {
                // Results don't match - set match to disputed
                await matches.updateOne(
                    { _id: new ObjectId(matchId) },
                    {
                        $set: {
                            status: 'disputed',
                            player1Scores: isPlayer1 ? scores : match.submittedScores,
                            player2Scores: isPlayer1 ? match.submittedScores : scores,
                            player1Winner: isPlayer1 ? winner : match.submittedWinner,
                            player2Winner: isPlayer1 ? match.submittedWinner : winner
                        }
                    }
                );

                // Notify tournament creator about the dispute
                try {
                    if (tournament.creatorId !== userId && tournament.creatorId !== otherPlayerId) {
                        const usersDb = await connectToSpecificDatabase('users-db');
                        const users = usersDb.collection('users');
                        const user = await users.findOne({ _id: new ObjectId(userId) });

                        const notificationRequest = {
                            recipientId: tournament.creatorId,
                            senderId: userId,
                            senderName: user?.name || 'Unknown User',
                            tournamentId: tournamentId,
                            tournamentName: tournament.name,
                            matchId: matchId,
                            type: 'match_disputed'
                        };

                        if (process.env.NOTIFICATION_API_URL) {
                            await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/tournaments', {
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
                }

                return createResponse(200, {
                    message: 'Match results submitted but do not match other player\'s submission. The match is now disputed.',
                    status: 'disputed'
                });
            }
        }

        // Notify the other player that a result has been submitted
        try {
            const usersDb = await connectToSpecificDatabase('users-db');
            const users = usersDb.collection('users');
            const user = await users.findOne({ _id: new ObjectId(userId) });

            const notificationRequest = {
                recipientId: otherPlayerId,
                senderId: userId,
                senderName: user?.name || 'Unknown User',
                tournamentId: tournamentId,
                tournamentName: tournament.name,
                matchId: matchId,
                type: 'match_result_submitted'
            };

            if (process.env.NOTIFICATION_API_URL) {
                await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/tournaments', {
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
        }

        return createResponse(200, {
            message: 'Match result submitted. Waiting for other player to confirm.',
            status: 'pending_confirmation'
        });
    } catch (error) {
        console.error('Submit match result error:', error);
        return createResponse(500, { message: 'Error submitting match result', error: error.message });
    }
}

// Resolve disputed match (tournament creator only)
export async function resolveDisputedMatch(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const tournamentId = event.pathParameters?.id;
        const matchId = event.pathParameters?.matchId;

        if (!tournamentId || !matchId) {
            return createResponse(400, { message: 'Tournament ID and Match ID are required' });
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

        if (!resolution || !['accept_player1', 'accept_player2', 'custom', 'no_contest'].includes(resolution)) {
            return createResponse(400, { message: 'Valid resolution type is required' });
        }

        if (resolution === 'custom' && (!scores || !winner)) {
            return createResponse(400, { message: 'Scores and winner are required for custom resolution' });
        }

        // Connect to tournaments database
        const db = await connectToDatabase();
        const tournaments = db.collection('tournaments');
        const matches = db.collection('competitiveMatches');

        // Get tournament and match
        let tournament, match;
        try {
            tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
            match = await matches.findOne({ _id: new ObjectId(matchId), tournamentId: tournamentId });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ID format', details: error.message });
        }

        if (!tournament) {
            return createResponse(404, { message: 'Tournament not found' });
        }

        if (!match) {
            return createResponse(404, { message: 'Match not found in this tournament' });
        }

        // Check if user is the tournament creator
        if (tournament.creatorId !== userId) {
            return createResponse(403, { message: 'Only the tournament creator can resolve disputed matches' });
        }

        // Check if the match is actually disputed
        if (match.status !== 'disputed') {
            return createResponse(400, { message: 'This match is not in a disputed state' });
        }

        // Determine the final scores and winner based on resolution
        let finalScores, finalWinner;

        switch (resolution) {
            case 'accept_player1':
                finalScores = match.player1Scores;
                finalWinner = match.player1Winner;
                break;
            case 'accept_player2':
                finalScores = match.player2Scores;
                finalWinner = match.player2Winner;
                break;
            case 'custom':
                finalScores = scores;
                finalWinner = winner;
                break;
            case 'no_contest':
                // Both players are removed from tournament
                return await removePlayersFromTournament(tournamentId, [match.player1, match.player2], tournaments, matches);
        }

        // Update match as resolved
        await matches.updateOne(
            { _id: new ObjectId(matchId) },
            {
                $set: {
                    status: 'completed',
                    scores: finalScores,
                    winner: finalWinner,
                    completedAt: new Date(),
                    resolution: resolution
                }
            }
        );

        // Advance the winner to the next round
        await advanceWinner(tournamentId, match, finalWinner, tournaments, matches);

        // Notify both players about the resolution
        try {
            const usersDb = await connectToSpecificDatabase('users-db');
            const users = usersDb.collection('users');
            const creator = await users.findOne({ _id: new ObjectId(userId) });

            for (const playerId of [match.player1, match.player2]) {
                const notificationRequest = {
                    recipientId: playerId,
                    senderId: userId,
                    senderName: creator?.name || 'Tournament Creator',
                    tournamentId: tournamentId,
                    tournamentName: tournament.name,
                    matchId: matchId,
                    type: 'match_dispute_resolved',
                    resolution: resolution,
                    isWinner: playerId === finalWinner
                };

                // Make request to your notification API
                if (process.env.NOTIFICATION_API_URL) {
                    await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/tournaments', {
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
            console.error('Error sending resolution notifications:', notificationError);
            // Continue without failing
        }

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

// Add this new endpoint function to tournament.mjs
export async function resetMatchSubmission(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const tournamentId = event.pathParameters?.id;
        const matchId = event.pathParameters?.matchId;

        if (!tournamentId || !matchId) {
            return createResponse(400, { message: 'Tournament ID and Match ID are required' });
        }

        // Connect to tournaments database
        const db = await connectToDatabase();
        const tournaments = db.collection('tournaments');
        const matches = db.collection('competitiveMatches');

        // Get tournament and match
        let tournament, match;
        try {
            tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
            match = await matches.findOne({
                _id: new ObjectId(matchId),
                tournamentId: tournamentId
            });
        } catch (error) {
            return createResponse(400, { message: 'Invalid ID format', details: error.message });
        }

        if (!tournament) {
            return createResponse(404, { message: 'Tournament not found' });
        }

        if (!match) {
            return createResponse(404, { message: 'Match not found in this tournament' });
        }

        // Check if user is a participant
        if (match.player1 !== userId && match.player2 !== userId) {
            return createResponse(403, { message: 'You are not a participant in this match' });
        }

        // Check if the match is in disputed status
        if (match.status !== 'disputed') {
            // Only allow resets for disputed matches
            return createResponse(400, { message: 'Only disputed matches can be reset for resubmission' });
        }

        // Reset submission state for this user
        const isPlayer1 = match.player1 === userId;
        const updateField = isPlayer1 ? 'player1Submitted' : 'player2Submitted';

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
            player: isPlayer1 ? 'player1' : 'player2'
        });
    } catch (error) {
        console.error('Reset match submission error:', error);
        return createResponse(500, { message: 'Error resetting match submission', error: error.message });
    }
}

// Helper function to generate tournament bracket
function generateBracket(players, format) {
    // Shuffle players for random seeding
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);

    // Calculate the number of rounds needed
    const numPlayers = shuffledPlayers.length;
    const numRounds = Math.ceil(Math.log2(numPlayers));
    const totalMatches = Math.pow(2, numRounds) - 1;

    // Calculate the number of "bye" matches needed to fill the bracket
    const numByes = Math.pow(2, numRounds) - numPlayers;

    // Create the bracket structure
    const bracketStructure = {
        numPlayers,
        numRounds,
        format,
        rounds: []
    };

    // Initialize rounds
    for (let i = 0; i < numRounds; i++) {
        bracketStructure.rounds.push({
            roundNumber: i + 1,
            matches: []
        });
    }

    // Generate initial matches
    const initialMatches = [];
    const firstRoundMatches = Math.pow(2, numRounds - 1);

    // Distribute players into first round, accounting for byes
    for (let i = 0; i < firstRoundMatches; i++) {
        const matchNumber = i + 1;
        const player1Index = i;
        const player2Index = firstRoundMatches * 2 - 1 - i;

        const player1 = player1Index < numPlayers ? shuffledPlayers[player1Index] : null;
        const player2 = player2Index < numPlayers ? shuffledPlayers[player2Index] : null;

        // Add to initial matches list
        initialMatches.push({
            matchNumber,
            round: 1,
            player1,
            player2
        });

        // Add to bracket structure
        bracketStructure.rounds[0].matches.push({
            matchNumber,
            player1: player1 ? { id: player1 } : null,
            player2: player2 ? { id: player2 } : null,
            winner: null
        });
    }

    // Initialize the rest of the bracket
    let currentMatchNumber = firstRoundMatches;
    for (let round = 1; round < numRounds; round++) {
        const matchesInRound = Math.pow(2, numRounds - round - 1);
        for (let i = 0; i < matchesInRound; i++) {
            currentMatchNumber++;
            const previousRoundIndex = round - 1;
            const matchNumber = currentMatchNumber;

            bracketStructure.rounds[round].matches.push({
                matchNumber,
                fromMatch1: firstRoundMatches + i * 2 - previousRoundIndex,
                fromMatch2: firstRoundMatches + i * 2 + 1 - previousRoundIndex,
                player1: null,
                player2: null,
                winner: null
            });
        }
    }

    return {
        bracketStructure,
        initialMatches
    };
}

// Helper function to compare match submissions
function compareSubmissions(scores1, scores2, winner1, winner2) {
    // Check if winners match
    if (winner1 !== winner2) {
        return false;
    }

    // Check if scores match
    if (scores1.length !== scores2.length) {
        return false;
    }

    for (let i = 0; i < scores1.length; i++) {
        const set1 = scores1[i];
        const set2 = scores2[i];

        if (set1.player1 !== set2.player1 || set1.player2 !== set2.player2) {
            return false;
        }
    }

    return true;
}

// Helper function to advance winner to next round
async function advanceWinner(tournamentId, match, winnerId, tournaments, matches) {
    try {
        // Get tournament
        const tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
        if (!tournament || tournament.status !== 'active') {
            return;
        }

        // Get the bracket structure
        const bracket = tournament.bracket;
        if (!bracket || !bracket.rounds) {
            return;
        }

        // Find the current match in the bracket
        const currentRound = match.round;
        const nextRound = currentRound + 1;

        // If this is the final round, update tournament as completed
        if (nextRound > bracket.numRounds) {
            await tournaments.updateOne(
                { _id: new ObjectId(tournamentId) },
                {
                    $set: {
                        status: 'completed',
                        completedAt: new Date(),
                        winner: winnerId
                    }
                }
            );
            return;
        }

        // Find the next match to advance to
        let nextMatch = null;
        let playerPosition = null; // 'player1' or 'player2'

        // Look through the next round matches to find where this match feeds into
        const nextRoundMatches = bracket.rounds[nextRound - 1].matches;
        for (const m of nextRoundMatches) {
            if (m.fromMatch1 === match.matchNumber) {
                nextMatch = m;
                playerPosition = 'player1';
                break;
            } else if (m.fromMatch2 === match.matchNumber) {
                nextMatch = m;
                playerPosition = 'player2';
                break;
            }
        }

        if (!nextMatch) {
            return;
        }

        // Update the bracket structure
        const updatePath = `bracket.rounds.${currentRound - 1}.matches`;
        const matchIndex = bracket.rounds[currentRound - 1].matches.findIndex(m => m.matchNumber === match.matchNumber);

        if (matchIndex === -1) {
            return;
        }

        await tournaments.updateOne(
            { _id: new ObjectId(tournamentId) },
            {
                $set: {
                    [`${updatePath}.${matchIndex}.winner`]: { id: winnerId }
                }
            }
        );

        // Update next match with the advancing player
        const nextUpdatePath = `bracket.rounds.${nextRound - 1}.matches`;
        const nextMatchIndex = bracket.rounds[nextRound - 1].matches.findIndex(m => m.matchNumber === nextMatch.matchNumber);

        if (nextMatchIndex === -1) {
            return;
        }

        await tournaments.updateOne(
            { _id: new ObjectId(tournamentId) },
            {
                $set: {
                    [`${nextUpdatePath}.${nextMatchIndex}.${playerPosition}`]: { id: winnerId }
                }
            }
        );

        // Check if both players for the next match are now set
        const updatedTournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
        const updatedNextMatch = updatedTournament.bracket.rounds[nextRound - 1].matches[nextMatchIndex];

        if (updatedNextMatch.player1 && updatedNextMatch.player2) {
            // Both players are now set, create the next match
            const matchDeadline = new Date();
            matchDeadline.setHours(matchDeadline.getHours() + tournament.challengeWindow);

            const newMatch = {
                tournamentId: tournamentId,
                matchNumber: updatedNextMatch.matchNumber,
                round: nextRound,
                player1: updatedNextMatch.player1.id,
                player2: updatedNextMatch.player2.id,
                winner: null,
                scores: [],
                status: 'scheduled',
                createdAt: new Date(),
                deadline: matchDeadline,
                player1Submitted: false,
                player2Submitted: false
            };

            await matches.insertOne(newMatch);

            // Notify both players about their new match
            const player1 = updatedNextMatch.player1.id;
            const player2 = updatedNextMatch.player2.id;

            try {
                const usersDb = await connectToSpecificDatabase('users-db');
                const users = usersDb.collection('users');

                for (const playerId of [player1, player2]) {
                    const opponent = playerId === player1 ? player2 : player1;
                    const opponentData = await users.findOne({ _id: new ObjectId(opponent) });

                    const notificationRequest = {
                        recipientId: playerId,
                        senderId: tournament.creatorId,
                        senderName: 'Tournament System',
                        tournamentId: tournamentId,
                        tournamentName: tournament.name,
                        matchId: newMatch._id.toString(),
                        type: 'new_tournament_match',
                        opponentName: opponentData?.name || 'Unknown Opponent'
                    };

                    // Make request to your notification API
                    if (process.env.NOTIFICATION_API_URL) {
                        await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/tournaments', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${process.env.API_KEY}`
                            },
                            body: JSON.stringify(notificationRequest)
                        });
                    }
                }
            } catch (notificationError) {
                console.error('Error sending new match notifications:', notificationError);
                // Continue without failing
            }
        }
    } catch (error) {
        console.error('Error advancing winner:', error);
    }
}

// Helper function to remove players from tournament
async function removePlayersFromTournament(tournamentId, playerIds, tournaments, matches) {
    try {
        // Update the match as "no contest"
        await matches.updateOne(
            { _id: new ObjectId(matchId) },
            {
                $set: {
                    status: 'no_contest',
                    completedAt: new Date()
                }
            }
        );

        // Notify players of the decision
        try {
            const tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
            const usersDb = await connectToSpecificDatabase('users-db');
            const users = usersDb.collection('users');

            for (const playerId of playerIds) {
                const notificationRequest = {
                    recipientId: playerId,
                    senderId: tournament.creatorId,
                    senderName: 'Tournament Creator',
                    tournamentId: tournamentId,
                    tournamentName: tournament.name,
                    type: 'removed_from_tournament'
                };

                // Make request to your notification API
                if (process.env.NOTIFICATION_API_URL) {
                    await fetch(process.env.NOTIFICATION_API_URL + '/notificationsapi/tournaments', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${process.env.API_KEY}`
                        },
                        body: JSON.stringify(notificationRequest)
                    });
                }
            }
        } catch (notificationError) {
            console.error('Error sending removal notifications:', notificationError);
            // Continue without failing
        }

        return createResponse(200, {
            message: 'Match has been marked as no contest. Both players have been removed from the tournament.',
            resolution: 'no_contest'
        });
    } catch (error) {
        console.error('Error removing players from tournament:', error);
        return createResponse(500, { message: 'Error removing players from tournament', error: error.message });
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

