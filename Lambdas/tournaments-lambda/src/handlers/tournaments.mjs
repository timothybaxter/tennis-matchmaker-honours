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
            } else if (matchInfo.isByeMatch) {
                // For bye matches, create a record but mark it as auto-completed
                const matchDeadline = new Date();
                matchDeadline.setHours(matchDeadline.getHours() + tournament.challengeWindow);

                // Determine the winner (the player who is present)
                const winner = matchInfo.player1 || matchInfo.player2;

                const match = {
                    tournamentId: tournamentId,
                    matchNumber: matchInfo.matchNumber,
                    round: matchInfo.round,
                    player1: matchInfo.player1,
                    player2: matchInfo.player2,
                    winner: winner,
                    scores: [],
                    status: 'completed',
                    createdAt: new Date(),
                    completedAt: new Date(),
                    deadline: matchDeadline,
                    player1Submitted: true,
                    player2Submitted: true,
                    isByeMatch: true
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

        // Handle automatic advancement for players with byes
        for (const byeInfo of bracket.playersWithByes) {
            // Find the created match record
            const matchRecord = initialMatches.find(m =>
                m.matchNumber === byeInfo.matchNumber &&
                (m.player1 === byeInfo.player || m.player2 === byeInfo.player)
            );

            if (matchRecord) {
                // Use advanceWinner to move the player to the next round
                await advanceWinner(tournamentId, matchRecord, byeInfo.player, tournaments, matches);

                console.log(`Auto-advanced player ${byeInfo.player} from match ${byeInfo.matchNumber} due to bye`);
            }
        }

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
            matches: createdMatches,
            autoAdvanced: bracket.playersWithByes.length
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

        if (!tournament) {
            return createResponse(404, { message: 'Tournament not found' });
        }

        if (!match) {
            return createResponse(404, { message: 'Match not found in this tournament' });
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
        const scoresField = isPlayer1 ? 'player1Scores' : 'player2Scores';
        const winnerField = isPlayer1 ? 'player1Winner' : 'player2Winner';
        const otherPlayerId = isPlayer1 ? match.player2 : match.player1;

        // Update with this submission
        const updateObj = {
            $set: {
                [updateField]: true,
                [`${updateField}At`]: new Date(),
                [scoresField]: scores,
                [winnerField]: winner
            }
        };

        await matches.updateOne(
            { _id: new ObjectId(matchId) },
            updateObj
        );

        // Re-fetch the match with updated submission data
        match = await matches.findOne({
            _id: new ObjectId(matchId),
            tournamentId: tournamentId
        });

        // Check if both players have now submitted
        if (match.player1Submitted && match.player2Submitted) {
            // Both players have submitted, compare results
            console.log(`Match ${matchId}: Both players have submitted results`);

            // Compare submissions
            const submissionsMatch = (
                JSON.stringify(match.player1Scores) === JSON.stringify(match.player2Scores) &&
                match.player1Winner === match.player2Winner
            );

            if (submissionsMatch) {
                console.log(`Match ${matchId}: Both players submitted matching results`);

                // Update match as completed with agreed results
                await matches.updateOne(
                    { _id: new ObjectId(matchId) },
                    {
                        $set: {
                            status: 'completed',
                            scores: match.player1Scores, // Can use either player's scores as they match
                            winner: match.player1Winner, // Can use either player's winner as they match
                            completedAt: new Date()
                        }
                    }
                );

                // Advance the winner to the next round
                await advanceWinner(tournamentId, match, match.player1Winner, tournaments, matches);

                return createResponse(200, {
                    message: 'Match result submitted and verified. Winner has advanced.',
                    status: 'completed',
                    winner: match.player1Winner
                });
            } else {
                console.log(`Match ${matchId}: Players submitted different results, marking as disputed`);

                // Results don't match - set match to disputed
                await matches.updateOne(
                    { _id: new ObjectId(matchId) },
                    {
                        $set: {
                            status: 'disputed',
                            disputedAt: new Date()
                            // We already have player1Scores, player2Scores, player1Winner, player2Winner
                        }
                    }
                );

                // Notify tournament creator about the dispute
                try {
                    if (tournament.creatorId !== match.player1 && tournament.creatorId !== match.player2) {
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
        } else {
            // Only one player has submitted - waiting for other player
            console.log(`Match ${matchId}: One player submitted, waiting for other player`);

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
                message: 'Result submitted successfully. Waiting for other player to confirm.',
                status: 'pending_confirmation'
            });
        }
    } catch (error) {
        console.error('Submit match result error:', error);
        return createResponse(500, { message: 'Error submitting match result', error: error.message });
    }
}
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
                return await removePlayersFromTournament(tournamentId, matchId, [match.player1, match.player2], tournaments, matches);
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
    const totalSpots = Math.pow(2, numRounds);

    // Calculate the number of "bye" matches needed to fill the bracket
    const numByes = totalSpots - numPlayers;

    console.log(`Generating bracket with ${numPlayers} players, ${numRounds} rounds, ${numByes} byes`);

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

    // Create player assignment with byes
    // We'll place byes in specific positions to make the bracket balanced
    const playerAssignments = new Array(totalSpots).fill(null);

    // Place players in the array
    for (let i = 0; i < numPlayers; i++) {
        playerAssignments[i] = shuffledPlayers[i];
    }

    // Optimize bye distribution to ensure balance
    // This algorithm places byes so they're evenly distributed across the bracket
    if (numByes > 0) {
        const byePositions = [];
        let step = totalSpots;
        let positions = [0];

        // Generate optimal bye positions based on tournament seeding principles
        while (byePositions.length < numByes) {
            step = step / 2;
            const newPositions = [];
            for (const pos of positions) {
                newPositions.push(pos);
                newPositions.push(pos + step);
            }
            positions = newPositions;
            if (positions.length >= numByes) {
                for (let i = 0; i < numByes; i++) {
                    byePositions.push(positions[i]);
                }
                break;
            }
        }

        // Adjust positions to account for array index and place bye players
        for (const pos of byePositions) {
            const index = pos % totalSpots;
            // If there's already a player there, swap them to the next available slot
            if (playerAssignments[index] !== null) {
                let nextFreeSlot = 0;
                while (nextFreeSlot < totalSpots && (byePositions.includes(nextFreeSlot) || playerAssignments[nextFreeSlot] !== null)) {
                    nextFreeSlot++;
                }
                playerAssignments[nextFreeSlot] = playerAssignments[index];
                playerAssignments[index] = null; // Mark as bye
            }
        }
    }

    // Track players who get a bye and need automatic advancement
    const playersWithByes = [];
    const advancementMap = {};

    // Create first-round matches from player assignments
    for (let i = 0; i < firstRoundMatches; i++) {
        const matchNumber = i + 1;
        const player1Index = i * 2;
        const player2Index = i * 2 + 1;

        const player1 = player1Index < totalSpots ? playerAssignments[player1Index] : null;
        const player2 = player2Index < totalSpots ? playerAssignments[player2Index] : null;

        // If only one player is present (bye match)
        if ((player1 && !player2) || (!player1 && player2)) {
            const advancingPlayer = player1 || player2;
            playersWithByes.push({
                player: advancingPlayer,
                matchNumber: matchNumber
            });

            // Determine the next round match this feeds into
            const nextRoundMatch = Math.floor((matchNumber - 1) / 2) + 1 + firstRoundMatches;
            const isRightBranch = matchNumber % 2 === 0; // Even match numbers go to right branch

            // Store which position in the next match this player advances to
            advancementMap[matchNumber] = {
                nextMatch: nextRoundMatch,
                position: isRightBranch ? 'player2' : 'player1'
            };
        }

        // Add to initial matches list
        initialMatches.push({
            matchNumber,
            round: 1,
            player1,
            player2,
            isByeMatch: (!player1 && player2) || (player1 && !player2)
        });

        // Add to bracket structure
        bracketStructure.rounds[0].matches.push({
            matchNumber,
            player1: player1 ? { id: player1 } : null,
            player2: player2 ? { id: player2 } : null,
            winner: null,
            isByeMatch: (!player1 && player2) || (player1 && !player2)
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

            // Calculate which matches from previous round feed into this one
            const fromMatch1 = i * 2 + 1;
            const fromMatch2 = i * 2 + 2;

            bracketStructure.rounds[round].matches.push({
                matchNumber,
                fromMatch1,
                fromMatch2,
                player1: null,
                player2: null,
                winner: null
            });
        }
    }

    return {
        bracketStructure,
        initialMatches,
        playersWithByes,
        advancementMap
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

async function advanceWinner(tournamentId, match, winnerId, tournaments, matches) {
    try {
        console.log(`Advancing winner ${winnerId} from match ${match.matchNumber} in round ${match.round}`);

        // Get tournament
        const tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
        if (!tournament || tournament.status !== 'active') {
            console.log(`Tournament ${tournamentId} not found or not active`);
            return;
        }

        const currentRound = match.round;
        const nextRound = currentRound + 1;

        // If this is the final round, update tournament as completed
        if (nextRound > tournament.bracket.numRounds) {
            console.log(`Tournament ${tournamentId} completed with winner ${winnerId}`);
            await tournaments.updateOne(
                { _id: new ObjectId(tournamentId) },
                { $set: { status: 'completed', completedAt: new Date(), winner: winnerId } }
            );
            return;
        }

        // Find next match in the proper round using fromMatch fields
        let nextMatchNumber = null;
        let playerPosition = null;

        // Find the round in the bracket structure
        const nextRoundData = tournament.bracket.rounds.find(r => r.roundNumber === nextRound);
        if (!nextRoundData) {
            console.error(`Could not find round ${nextRound} in tournament structure`);
            return;
        }

        // Find the next match that this match feeds into
        for (const nextMatch of nextRoundData.matches) {
            if (nextMatch.fromMatch1 === match.matchNumber) {
                nextMatchNumber = nextMatch.matchNumber;
                playerPosition = 'player1';
                break;
            }
            if (nextMatch.fromMatch2 === match.matchNumber) {
                nextMatchNumber = nextMatch.matchNumber;
                playerPosition = 'player2';
                break;
            }
        }

        // If we can't find explicit fromMatch fields, use position-based logic
        if (!nextMatchNumber) {
            // Use the old method as fallback, but adjusted for sequential numbering
            const matchesInCurrentRound = Math.pow(2, tournament.bracket.numRounds - currentRound);
            const firstMatchInNextRound = matchesInCurrentRound + 1;
            nextMatchNumber = firstMatchInNextRound + Math.floor((match.matchNumber - 1) / 2);

            // Determine player position based on match number
            playerPosition = match.matchNumber % 2 === 1 ? 'player1' : 'player2';
        }

        console.log(`Winner goes to ${playerPosition} in match ${nextMatchNumber} of round ${nextRound}`);

        // Find round indices
        let currentRoundIndex = -1;
        let nextRoundIndex = -1;

        for (let i = 0; i < tournament.bracket.rounds.length; i++) {
            if (tournament.bracket.rounds[i].roundNumber === currentRound) {
                currentRoundIndex = i;
            }
            if (tournament.bracket.rounds[i].roundNumber === nextRound) {
                nextRoundIndex = i;
            }
        }

        if (currentRoundIndex === -1 || nextRoundIndex === -1) {
            console.error(`Could not find round indexes in bracket structure`);
            return;
        }

        // Update current match winner
        let currentMatchIndex = -1;
        for (let i = 0; i < tournament.bracket.rounds[currentRoundIndex].matches.length; i++) {
            if (tournament.bracket.rounds[currentRoundIndex].matches[i].matchNumber === match.matchNumber) {
                currentMatchIndex = i;
                break;
            }
        }

        if (currentMatchIndex === -1) {
            console.error(`Could not find match ${match.matchNumber} in round ${currentRound}`);
            return;
        }

        // Update winner in current match
        await tournaments.updateOne(
            { _id: new ObjectId(tournamentId) },
            { $set: { [`bracket.rounds.${currentRoundIndex}.matches.${currentMatchIndex}.winner`]: { id: winnerId } } }
        );

        // Find next match index
        let nextMatchIndex = -1;
        for (let i = 0; i < tournament.bracket.rounds[nextRoundIndex].matches.length; i++) {
            if (tournament.bracket.rounds[nextRoundIndex].matches[i].matchNumber === nextMatchNumber) {
                nextMatchIndex = i;
                break;
            }
        }

        if (nextMatchIndex === -1) {
            console.error(`Could not find match ${nextMatchNumber} in round ${nextRound}`);
            return;
        }

        // Update player in next match
        await tournaments.updateOne(
            { _id: new ObjectId(tournamentId) },
            { $set: { [`bracket.rounds.${nextRoundIndex}.matches.${nextMatchIndex}.${playerPosition}`]: { id: winnerId } } }
        );

        // Get updated tournament and create next match if needed
        const updatedTournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
        const nextMatchData = updatedTournament.bracket.rounds[nextRoundIndex].matches[nextMatchIndex];

        // Check if match already exists
        const existingMatch = await matches.findOne({
            tournamentId: tournamentId,
            round: nextRound,
            matchNumber: nextMatchNumber
        });

        // Create the match if it doesn't exist
        if (!existingMatch) {
            const player1 = nextMatchData.player1 ? nextMatchData.player1.id : null;
            const player2 = nextMatchData.player2 ? nextMatchData.player2.id : null;

            // Only create match if at least one player is assigned
            if (player1 || player2) {
                console.log(`Creating match ${nextMatchNumber} in round ${nextRound} with players: ${player1 || 'TBD'} vs ${player2 || 'TBD'}`);

                const matchDeadline = new Date();
                matchDeadline.setHours(matchDeadline.getHours() + tournament.challengeWindow);

                // Check if this is a bye match
                const isByeMatch = (player1 && player2 && player1 === player2) ||
                    (player1 && !player2) ||
                    (!player1 && player2);

                let status = 'scheduled';
                let winner = null;
                let player1Submitted = false;
                let player2Submitted = false;
                let completedAt = null;

                if (isByeMatch) {
                    status = 'completed';
                    winner = player1 || player2;
                    player1Submitted = true;
                    player2Submitted = true;
                    completedAt = new Date();
                    console.log(`Auto-completing match for player ${winner} (bye match)`);
                }

                const newMatch = {
                    tournamentId: tournamentId,
                    matchNumber: nextMatchNumber,
                    round: nextRound,
                    player1: player1,
                    player2: player2,
                    winner: winner,
                    scores: [],
                    status: status,
                    createdAt: new Date(),
                    deadline: matchDeadline,
                    player1Submitted: player1Submitted,
                    player2Submitted: player2Submitted,
                    completedAt: completedAt,
                    isByeMatch: isByeMatch
                };

                // Insert the match
                const result = await matches.insertOne(newMatch);
                console.log(`Created match: ${result.insertedId}`);

                // If this is a bye match, immediately advance the winner
                if (isByeMatch && winner) {
                    console.log(`Auto-advancing player ${winner} from bye match`);
                    const newMatchObj = { ...newMatch, _id: result.insertedId };
                    await advanceWinner(tournamentId, newMatchObj, winner, tournaments, matches);
                }
            }
        } else {
            console.log(`Match ${nextMatchNumber} in round ${nextRound} already exists`);

            // Update existing match with winner information if it's a bye match
            if ((player1 && !player2) || (!player1 && player2)) {
                const winningPlayer = player1 || player2;
                await matches.updateOne(
                    { _id: existingMatch._id },
                    {
                        $set: {
                            player1: player1,
                            player2: player2
                        }
                    }
                );
            }
        }
    } catch (error) {
        console.error('Error in advanceWinner:', error);
        console.error(error.stack);
    }
}
// This function explicitly creates the final match for a tournament if needed
async function ensureFinalMatchExists(tournamentId) {
    try {
        console.log(`Checking final match for tournament: ${tournamentId}`);

        // Connect to databases
        const db = await connectToDatabase();
        const tournaments = db.collection('tournaments');
        const matches = db.collection('competitiveMatches');

        // Get tournament
        const tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
        if (!tournament || tournament.status !== 'active') {
            console.log(`Tournament is not active or not found`);
            return false;
        }

        // Check if tournament has 2 rounds (semifinals and final)
        const bracket = tournament.bracket;
        if (!bracket || !bracket.rounds || bracket.rounds.length < 2) {
            console.log(`Tournament doesn't have enough rounds`);
            return false;
        }

        // Check if all semifinal matches are completed
        const semifinalMatches = await matches.find({
            tournamentId: tournamentId,
            round: 1
        }).toArray();

        const allSemifinalsCompleted = semifinalMatches.every(match => match.status === 'completed' && match.winner);

        if (!allSemifinalsCompleted) {
            console.log(`Not all semifinal matches are completed`);
            return false;
        }

        // Check if final match exists
        const finalMatch = await matches.findOne({
            tournamentId: tournamentId,
            round: 2
        });

        if (finalMatch) {
            console.log(`Final match already exists: ${finalMatch._id}`);
            return true;
        }

        // Get the winners from semifinals to create the final
        const semifinalWinners = {};
        for (const match of semifinalMatches) {
            const position = match.matchNumber % 2 === 1 ? 'player1' : 'player2';
            semifinalWinners[position] = match.winner;
        }

        console.log(`Semifinal winners: ${JSON.stringify(semifinalWinners)}`);

        // Get the final match number
        const finalMatchNumber = Math.ceil(semifinalMatches[0].matchNumber / 2);

        // Create the final match
        const matchDeadline = new Date();
        matchDeadline.setHours(matchDeadline.getHours() + (tournament.challengeWindow || 48));

        const newMatch = {
            tournamentId: tournamentId,
            matchNumber: finalMatchNumber,
            round: 2,
            player1: semifinalWinners.player1,
            player2: semifinalWinners.player2,
            winner: null,
            scores: [],
            status: 'scheduled',
            createdAt: new Date(),
            deadline: matchDeadline,
            player1Submitted: false,
            player2Submitted: false
        };

        // Also update the bracket data to ensure consistency
        await tournaments.updateOne(
            { _id: new ObjectId(tournamentId) },
            {
                $set: {
                    "bracket.rounds.1.matches.$[match].player1": { id: semifinalWinners.player1 },
                    "bracket.rounds.1.matches.$[match].player2": { id: semifinalWinners.player2 }
                }
            },
            {
                arrayFilters: [
                    { "match.matchNumber": finalMatchNumber }
                ]
            }
        );

        const result = await matches.insertOne(newMatch);
        console.log(`Created final match: ${result.insertedId}`);

        return true;
    } catch (error) {
        console.error('Error ensuring final match exists:', error);
        return false;
    }
}

// Add this to your tournament Lambda handlers
export async function ensureTournamentFinals(event) {
    try {
        // Extract tournament ID
        const tournamentId = event.pathParameters?.id;

        if (!tournamentId) {
            return createResponse(400, { message: 'Tournament ID is required' });
        }

        const result = await ensureFinalMatchExists(tournamentId);

        return createResponse(200, {
            success: result,
            message: result ? 'Final match exists or was created' : 'Unable to create final match'
        });
    } catch (error) {
        console.error('Error in ensureTournamentFinals:', error);
        return createResponse(500, {
            message: 'Error ensuring tournament finals',
            error: error.message
        });
    }
}
// Helper function to remove players from tournament
async function removePlayersFromTournament(tournamentId, matchId, playerIds, tournaments, matches) {
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


// Invite a user to a tournament
export async function inviteToTournament(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const inviterId = token.decoded.userId;
        const tournamentId = event.pathParameters?.id;

        if (!tournamentId) {
            return createResponse(400, { message: 'Tournament ID is required' });
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
        const tournaments = db.collection('tournaments');
        const invitations = db.collection('tournamentInvitations');

        // Check if tournament exists and is valid to invite to
        let tournament;
        try {
            tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid tournament ID format' });
        }

        if (!tournament) {
            return createResponse(404, { message: 'Tournament not found' });
        }

        // Check if user is the creator or has permission to invite
        if (tournament.creatorId !== inviterId) {
            return createResponse(403, { message: 'Only the tournament creator can send invitations' });
        }

        // Check if tournament has already started
        if (tournament.status !== 'pending') {
            return createResponse(400, { message: 'Cannot invite to a tournament that has already started' });
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

        // Check if user is already in the tournament
        if (tournament.players.includes(inviteeId)) {
            return createResponse(400, { message: 'User is already participating in this tournament' });
        }

        // Check if invitation already exists
        const existingInvitation = await invitations.findOne({
            tournamentId: tournamentId,
            inviteeId: inviteeId,
            status: 'pending'
        });

        if (existingInvitation) {
            return createResponse(400, { message: 'Invitation already sent to this user' });
        }

        // Create invitation
        const invitation = {
            tournamentId: tournamentId,
            tournamentName: tournament.name,
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
                    tournamentId: tournamentId,
                    tournamentName: tournament.name,
                    type: 'tournament_invitation',
                    content: `You have been invited to join the tournament: ${tournament.name}`,
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
        console.error('Invite to tournament error:', error);
        return createResponse(500, { message: 'Error sending tournament invitation', error: error.message });
    }
}

// Accept tournament invitation
export async function acceptTournamentInvitation(event) {
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
        const tournaments = db.collection('tournaments');
        const invitations = db.collection('tournamentInvitations');

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

        // Check if tournament exists and is still pending
        let tournament;
        try {
            tournament = await tournaments.findOne({ _id: new ObjectId(invitation.tournamentId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid tournament ID format' });
        }

        if (!tournament) {
            await invitations.updateOne(
                { _id: new ObjectId(invitationId) },
                { $set: { status: 'cancelled', updatedAt: new Date() } }
            );
            return createResponse(404, { message: 'Tournament no longer exists' });
        }

        // Check if tournament has already started
        if (tournament.status !== 'pending') {
            await invitations.updateOne(
                { _id: new ObjectId(invitationId) },
                { $set: { status: 'expired', updatedAt: new Date() } }
            );
            return createResponse(400, { message: 'Tournament has already started' });
        }

        // Update invitation status
        await invitations.updateOne(
            { _id: new ObjectId(invitationId) },
            { $set: { status: 'accepted', updatedAt: new Date() } }
        );

        // Add user to tournament
        await tournaments.updateOne(
            { _id: new ObjectId(invitation.tournamentId) },
            { $push: { players: userId } }
        );

        // Send notification to tournament creator
        try {
            if (process.env.NOTIFICATION_API_URL) {
                const notificationRequest = {
                    recipientId: invitation.inviterId,
                    senderId: userId,
                    senderName: invitation.inviteeName,
                    tournamentId: invitation.tournamentId,
                    tournamentName: invitation.tournamentName,
                    type: 'tournament_invitation_accepted',
                    content: `${invitation.inviteeName} has accepted your invitation to join ${invitation.tournamentName}`,
                    relatedItemId: invitation.tournamentId
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
            // Continue without failing
        }

        return createResponse(200, {
            message: 'Tournament invitation accepted successfully',
            tournamentId: invitation.tournamentId,
            tournamentName: invitation.tournamentName
        });
    } catch (error) {
        console.error('Accept tournament invitation error:', error);
        return createResponse(500, { message: 'Error accepting tournament invitation', error: error.message });
    }
}

// Reject tournament invitation
export async function rejectTournamentInvitation(event) {
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
        const invitations = db.collection('tournamentInvitations');

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

        // Send notification to tournament creator
        try {
            if (process.env.NOTIFICATION_API_URL) {
                const notificationRequest = {
                    recipientId: invitation.inviterId,
                    senderId: userId,
                    senderName: invitation.inviteeName,
                    tournamentId: invitation.tournamentId,
                    tournamentName: invitation.tournamentName,
                    type: 'tournament_invitation_rejected',
                    content: `${invitation.inviteeName} has declined your invitation to join ${invitation.tournamentName}`,
                    relatedItemId: invitation.tournamentId
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
            // Continue without failing
        }

        return createResponse(200, {
            message: 'Tournament invitation rejected successfully'
        });
    } catch (error) {
        console.error('Reject tournament invitation error:', error);
        return createResponse(500, { message: 'Error rejecting tournament invitation', error: error.message });
    }
}

// Get pending invitations for a user
export async function getPendingInvitations(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;

        // Connect to database
        const db = await connectToDatabase();
        const invitations = db.collection('tournamentInvitations');

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
        console.error('Get pending invitations error:', error);
        return createResponse(500, { message: 'Error retrieving pending invitations', error: error.message });
    }
}

// Get sent invitations for a tournament
export async function getSentInvitations(event) {
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

        // Connect to databases
        const db = await connectToDatabase();
        const tournaments = db.collection('tournaments');
        const invitations = db.collection('tournamentInvitations');

        // Check if tournament exists
        let tournament;
        try {
            tournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid tournament ID format' });
        }

        if (!tournament) {
            return createResponse(404, { message: 'Tournament not found' });
        }

        // Check if user is the creator or has permission to view invitations
        if (tournament.creatorId !== userId) {
            return createResponse(403, { message: 'Only the tournament creator can view sent invitations' });
        }

        // Get all invitations for this tournament
        const tournamentInvitations = await invitations.find({
            tournamentId: tournamentId
        }).sort({ createdAt: -1 }).toArray();

        return createResponse(200, {
            invitations: tournamentInvitations.map(invitation => ({
                ...invitation,
                id: invitation._id.toString()
            }))
        });
    } catch (error) {
        console.error('Get sent invitations error:', error);
        return createResponse(500, { message: 'Error retrieving sent invitations', error: error.message });
    }
}
// Cancel tournament invitation (for tournament creators to cancel a pending invitation)
export async function cancelTournamentInvitation(event) {
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
        const invitations = db.collection('tournamentInvitations');
        const tournaments = db.collection('tournaments');

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

        // Check if tournament exists
        let tournament;
        try {
            tournament = await tournaments.findOne({ _id: new ObjectId(invitation.tournamentId) });
        } catch (error) {
            return createResponse(400, { message: 'Invalid tournament ID format' });
        }

        if (!tournament) {
            return createResponse(404, { message: 'Tournament not found' });
        }

        // Check if user is the tournament creator
        if (tournament.creatorId !== userId) {
            return createResponse(403, { message: 'Only the tournament creator can cancel invitations' });
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
                    tournamentId: invitation.tournamentId,
                    tournamentName: invitation.tournamentName,
                    type: 'tournament_invitation_cancelled',
                    content: `Your invitation to join ${invitation.tournamentName} has been cancelled`,
                    relatedItemId: invitation.tournamentId
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
            // Continue without failing
        }

        return createResponse(200, {
            message: 'Tournament invitation cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel tournament invitation error:', error);
        return createResponse(500, { message: 'Error cancelling tournament invitation', error: error.message });
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