// src/handlers/competitiveMatches.mjs
import jwt from 'jsonwebtoken';
import { connectToDatabase, connectToSpecificDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';
import fetch from 'node-fetch';

// Get match history for user
// Get match history for user
// Get match history for user
export async function getMatchHistory(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const queryParams = event.queryStringParameters || {};

        // If userId is empty in queryParams, use token's userId
        const targetUserId = queryParams.userId || userId;

        // Validate that we have a user ID to query
        if (!targetUserId) {
            return createResponse(400, { message: 'User ID is required for match history' });
        }

        console.log(`Getting match history for user: ${targetUserId}`);

        // Get matches with pagination
        const limit = parseInt(queryParams.limit) || 10;
        const skip = parseInt(queryParams.skip) || 0;

        // Build base query
        const baseQuery = {
            $or: [
                { challengerId: targetUserId },
                { challengeeId: targetUserId },
                { player1: targetUserId },
                { player2: targetUserId }
            ],
            status: 'completed'
        };

        // Apply filters if provided
        if (queryParams.type) {
            if (queryParams.type === 'tournament') {
                baseQuery.tournamentId = { $exists: true };
            } else if (queryParams.type === 'ladder') {
                baseQuery.ladderId = { $exists: true };
            }
        }

        // Apply context ID filter if provided
        if (queryParams.contextId) {
            if (queryParams.type === 'tournament') {
                baseQuery.tournamentId = queryParams.contextId;
            } else if (queryParams.type === 'ladder') {
                baseQuery.ladderId = queryParams.contextId;
            }
        }

        console.log(`Base query for match history: ${JSON.stringify(baseQuery)}`);

        // First, get tournament matches
        const tournamentsDb = await connectToSpecificDatabase('tournaments-db');
        const tournamentMatchesCollection = tournamentsDb.collection('competitiveMatches');
        const tournamentMatchesResults = await tournamentMatchesCollection.find(baseQuery)
            .sort({ completedAt: -1 })
            .toArray();

        console.log(`Found ${tournamentMatchesResults.length} tournament matches`);

        // Then, get ladder matches
        const laddersDb = await connectToSpecificDatabase('ladders-db');
        const ladderMatchesCollection = laddersDb.collection('competitiveMatches');
        const ladderMatchesResults = await ladderMatchesCollection.find(baseQuery)
            .toArray();

        console.log(`Found ${ladderMatchesResults.length} ladder matches`);

        // Combine all matches
        const combinedMatches = [...tournamentMatchesResults, ...ladderMatchesResults];

        // Sort by completedAt date
        const sortedMatches = combinedMatches.sort((a, b) => {
            const dateA = a.completedAt ? new Date(a.completedAt) : new Date(0);
            const dateB = b.completedAt ? new Date(b.completedAt) : new Date(0);
            return dateB - dateA; // Descending order
        });

        // Apply pagination
        const matchHistory = sortedMatches.slice(skip, skip + limit);

        // Get total count for pagination
        const totalMatches = combinedMatches.length;

        console.log(`Found ${matchHistory.length} matches in history (${totalMatches} total)`);

        // Get user details for all participants
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Extract all user IDs from matches
        const userIds = new Set();
        matchHistory.forEach(match => {
            if (match.challengerId) userIds.add(match.challengerId);
            if (match.challengeeId) userIds.add(match.challengeeId);
            if (match.player1) userIds.add(match.player1);
            if (match.player2) userIds.add(match.player2);
            if (match.winner) userIds.add(match.winner);
        });

        // Convert to ObjectIds for MongoDB query
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

        // Create user lookup
        const userLookup = {};
        userDetails.forEach(user => {
            userLookup[user._id.toString()] = {
                id: user._id.toString(),
                name: user.name,
                playerLevel: user.playerLevel
            };
        });

        // Get context details for tournaments and ladders
        const contextIds = {
            tournaments: new Set(),
            ladders: new Set()
        };

        matchHistory.forEach(match => {
            if (match.tournamentId) contextIds.tournaments.add(match.tournamentId);
            if (match.ladderId) contextIds.ladders.add(match.ladderId);
        });

        // Get tournament details
        const tournaments = tournamentsDb.collection('tournaments');

        const tournamentObjectIds = Array.from(contextIds.tournaments)
            .map(id => {
                try { return new ObjectId(id); }
                catch (e) { return null; }
            })
            .filter(id => id !== null);

        const tournamentDetails = await tournaments.find({
            _id: { $in: tournamentObjectIds }
        }).project({
            _id: 1,
            name: 1,
            format: 1
        }).toArray();

        const tournamentLookup = {};
        tournamentDetails.forEach(tournament => {
            tournamentLookup[tournament._id.toString()] = {
                id: tournament._id.toString(),
                name: tournament.name,
                format: tournament.format
            };
        });

        // Get ladder details
        const ladders = laddersDb.collection('ladders');

        const ladderObjectIds = Array.from(contextIds.ladders)
            .map(id => {
                try { return new ObjectId(id); }
                catch (e) { return null; }
            })
            .filter(id => id !== null);

        const ladderDetails = await ladders.find({
            _id: { $in: ladderObjectIds }
        }).project({
            _id: 1,
            name: 1
        }).toArray();

        const ladderLookup = {};
        ladderDetails.forEach(ladder => {
            ladderLookup[ladder._id.toString()] = {
                id: ladder._id.toString(),
                name: ladder.name
            };
        });

        // Enhance match history with details
        const enhancedMatches = matchHistory.map(match => {
            const enhancedMatch = {
                ...match,
                id: match._id.toString(),
                isWinner: match.winner === targetUserId
            };

            // Add tournament details if applicable
            if (match.tournamentId && tournamentLookup[match.tournamentId]) {
                enhancedMatch.tournament = tournamentLookup[match.tournamentId];
                enhancedMatch.contextType = 'tournament';
            }

            // Add ladder details if applicable
            if (match.ladderId && ladderLookup[match.ladderId]) {
                enhancedMatch.ladder = ladderLookup[match.ladderId];
                enhancedMatch.contextType = 'ladder';
            }

            // Add player details
            if (match.challengerId && userLookup[match.challengerId]) {
                enhancedMatch.challenger = userLookup[match.challengerId];
            }

            if (match.challengeeId && userLookup[match.challengeeId]) {
                enhancedMatch.challengee = userLookup[match.challengeeId];
            }

            if (match.player1 && userLookup[match.player1]) {
                enhancedMatch.player1Details = userLookup[match.player1];
            }

            if (match.player2 && userLookup[match.player2]) {
                enhancedMatch.player2Details = userLookup[match.player2];
            }

            // Determine opponent
            if (match.challenger && match.challengee) {
                enhancedMatch.opponent = match.challengerId === targetUserId
                    ? enhancedMatch.challengee
                    : enhancedMatch.challenger;
            } else if (match.player1Details && match.player2Details) {
                enhancedMatch.opponent = match.player1 === targetUserId
                    ? enhancedMatch.player2Details
                    : enhancedMatch.player1Details;
            }

            return enhancedMatch;
        });

        return createResponse(200, {
            matches: enhancedMatches,
            pagination: {
                total: totalMatches,
                limit: limit,
                skip: skip
            }
        });
    } catch (error) {
        console.error('Get match history error:', error);
        return createResponse(500, { message: 'Error retrieving match history', error: error.message });
    }
}
// Get match by ID
export async function getMatchById(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        const matchId = event.pathParameters?.id;

        if (!matchId) {
            return createResponse(400, { message: 'Match ID is required' });
        }

        // Connect to matches database
        const db = await connectToDatabase();
        const matches = db.collection('competitiveMatches');

        // Get match
        let match;
        try {
            match = await matches.findOne({ _id: new ObjectId(matchId) });
        } catch (error) {
            console.error('Invalid match ID format:', error);
            return createResponse(400, { message: 'Invalid match ID format' });
        }

        if (!match) {
            return createResponse(404, { message: 'Match not found' });
        }

        // Check if user is a participant or admin
        const isParticipant = [match.challengerId, match.challengeeId, match.player1, match.player2].includes(userId);
        let isAdmin = false;

        // Check if tournament or ladder admin
        if (match.tournamentId) {
            const tournamentsDb = await connectToSpecificDatabase('tournaments-db');
            const tournaments = tournamentsDb.collection('tournaments');

            const tournament = await tournaments.findOne({
                _id: new ObjectId(match.tournamentId),
                creatorId: userId
            });

            isAdmin = !!tournament;
        } else if (match.ladderId) {
            const laddersDb = await connectToSpecificDatabase('ladders-db');
            const ladders = laddersDb.collection('ladders');

            const ladder = await ladders.findOne({
                _id: new ObjectId(match.ladderId),
                creatorId: userId
            });

            isAdmin = !!ladder;
        }

        if (!isParticipant && !isAdmin) {
            return createResponse(403, { message: 'You do not have permission to view this match' });
        }

        // Get user details
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Extract all user IDs from match
        const userIds = new Set();
        if (match.challengerId) userIds.add(match.challengerId);
        if (match.challengeeId) userIds.add(match.challengeeId);
        if (match.player1) userIds.add(match.player1);
        if (match.player2) userIds.add(match.player2);
        if (match.winner) userIds.add(match.winner);

        // Convert to ObjectIds for MongoDB query
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

        // Create user lookup
        const userLookup = {};
        userDetails.forEach(user => {
            userLookup[user._id.toString()] = {
                id: user._id.toString(),
                name: user.name,
                playerLevel: user.playerLevel
            };
        });

        // Get context details
        let context = null;

        if (match.tournamentId) {
            const tournamentsDb = await connectToSpecificDatabase('tournaments-db');
            const tournaments = tournamentsDb.collection('tournaments');

            const tournament = await tournaments.findOne({ _id: new ObjectId(match.tournamentId) });

            if (tournament) {
                context = {
                    type: 'tournament',
                    id: tournament._id.toString(),
                    name: tournament.name,
                    format: tournament.format
                };
            }
        } else if (match.ladderId) {
            const laddersDb = await connectToSpecificDatabase('ladders-db');
            const ladders = laddersDb.collection('ladders');

            const ladder = await ladders.findOne({ _id: new ObjectId(match.ladderId) });

            if (ladder) {
                context = {
                    type: 'ladder',
                    id: ladder._id.toString(),
                    name: ladder.name
                };
            }
        }

        const enhancedMatch = {
            ...match,
            id: match._id.toString(),
            context: context,
            isParticipant: isParticipant,
            isAdmin: isAdmin,
            canSubmitResult: isParticipant && ['scheduled', 'accepted'].includes(match.status)
        };

        // Add player details
        if (match.challengerId && userLookup[match.challengerId]) {
            enhancedMatch.challenger = userLookup[match.challengerId];
        }

        if (match.challengeeId && userLookup[match.challengeeId]) {
            enhancedMatch.challengee = userLookup[match.challengeeId];
        }

        if (match.player1 && userLookup[match.player1]) {
            enhancedMatch.player1Details = userLookup[match.player1];
        }

        if (match.player2 && userLookup[match.player2]) {
            enhancedMatch.player2Details = userLookup[match.player2];
        }

        if (match.winner && userLookup[match.winner]) {
            enhancedMatch.winnerDetails = userLookup[match.winner];
        }

        return createResponse(200, { match: enhancedMatch });
    } catch (error) {
        console.error('Get match by ID error:', error);
        return createResponse(500, { message: 'Error retrieving match', error: error.message });
    }
}

export async function getActiveMatches(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        const userId = token.decoded.userId;
        console.log(`Getting active matches for user: ${userId}`);

        // Array to store all active matches
        let allMatches = [];

        // 1. Query tournament competitive matches
        try {
            const tournamentsDb = await connectToSpecificDatabase('tournaments-db');
            const tournaments = tournamentsDb.collection('tournaments');
            const tournamentMatches = tournamentsDb.collection('competitiveMatches');

            const tournamentQuery = {
                $or: [
                    { player1: userId },
                    { player2: userId }
                ],
                status: { $in: ["scheduled", "disputed"] }  
            };

            console.log("Tournament query:", JSON.stringify(tournamentQuery));
            const tournamentResults = await tournamentMatches.find(tournamentQuery).toArray();
            console.log(`Found ${tournamentResults.length} tournament matches`);

            // Get tournament info for each match
            for (const match of tournamentResults) {
                let tournamentInfo = null;

                if (match.tournamentId) {
                    try {
                        const tournament = await tournaments.findOne({ _id: new ObjectId(match.tournamentId) });
                        if (tournament) {
                            tournamentInfo = {
                                id: tournament._id.toString(),
                                name: tournament.name,
                                format: tournament.format
                            };
                        }
                    } catch (err) {
                        console.error("Error fetching tournament info:", err);
                    }
                }

                allMatches.push({
                    ...match,
                    id: match._id.toString(),
                    matchType: "tournament",
                    tournament: tournamentInfo
                });
            }
        } catch (tournamentError) {
            console.error("Tournament query error:", tournamentError);
        }

        // 2. Query ladder competitive matches
        try {
            const laddersDb = await connectToSpecificDatabase('ladders-db');
            const ladders = laddersDb.collection('ladders');
            const ladderMatches = laddersDb.collection('competitiveMatches');

            const ladderQuery = {
                $or: [
                    { challengerId: userId },
                    { challengeeId: userId }
                ],
                status: { $in: ["scheduled", "accepted", "disputed"] }  
            };

            console.log("Ladder query:", JSON.stringify(ladderQuery));
            const ladderResults = await ladderMatches.find(ladderQuery).toArray();
            console.log(`Found ${ladderResults.length} ladder matches`);

            // Get ladder info for each match
            for (const match of ladderResults) {
                let ladderInfo = null;

                if (match.ladderId) {
                    try {
                        const ladder = await ladders.findOne({ _id: new ObjectId(match.ladderId) });
                        if (ladder) {
                            ladderInfo = {
                                id: ladder._id.toString(),
                                name: ladder.name
                            };
                        }
                    } catch (err) {
                        console.error("Error fetching ladder info:", err);
                    }
                }

                // Determine if user is the challengee
                const isChallengee = match.challengeeId === userId;

                allMatches.push({
                    ...match,
                    id: match._id.toString(),
                    matchType: "ladder",
                    ladder: ladderInfo,
                    isChallengee: isChallengee
                });
            }
        } catch (ladderError) {
            console.error("Ladder query error:", ladderError);
        }

        // If no matches found, return empty array
        if (allMatches.length === 0) {
            console.log("No active matches found for user:", userId);
            return createResponse(200, { matches: [] });
        }

        // Get user details for all participants
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Extract all user IDs from matches
        const userIds = new Set();
        allMatches.forEach(match => {
            if (match.player1) userIds.add(match.player1);
            if (match.player2) userIds.add(match.player2);
            if (match.challengerId) userIds.add(match.challengerId);
            if (match.challengeeId) userIds.add(match.challengeeId);
        });

        // Convert to ObjectIds for MongoDB query
        const userObjectIds = Array.from(userIds)
            .map(id => {
                try { return new ObjectId(id); }
                catch (e) { return null; }
            })
            .filter(id => id !== null);

        // Get user details
        const userDetailsArray = await users.find({
            _id: { $in: userObjectIds }
        }).project({
            _id: 1,
            name: 1,
            playerLevel: 1
        }).toArray();

        // Create lookup table for user details
        const userLookup = {};
        userDetailsArray.forEach(user => {
            userLookup[user._id.toString()] = {
                id: user._id.toString(),
                name: user.name,
                playerLevel: user.playerLevel
            };
        });

        // Enhance matches with opponent details
        const now = new Date();
        const enhancedMatches = allMatches.map(match => {
            const enhancedMatch = { ...match };

            // Add opponent information based on match type
            if (match.matchType === "tournament") {
                const opponentId = match.player1 === userId ? match.player2 : match.player1;
                enhancedMatch.opponent = userLookup[opponentId] || { name: "Unknown", playerLevel: "Unknown" };
            } else if (match.matchType === "ladder") {
                const opponentId = match.challengerId === userId ? match.challengeeId : match.challengerId;
                enhancedMatch.opponent = userLookup[opponentId] || { name: "Unknown", playerLevel: "Unknown" };
            }

            // Calculate time remaining and expired status
            if (match.deadline) {
                const deadlineDate = new Date(match.deadline);
                const timeRemaining = deadlineDate - now;
                enhancedMatch.isExpired = timeRemaining <= 0;
                enhancedMatch.timeRemaining = Math.max(0, timeRemaining);
            }

            return enhancedMatch;
        });

        console.log(`Returning ${enhancedMatches.length} enhanced matches`);
        return createResponse(200, { matches: enhancedMatches });
    } catch (error) {
        console.error('Get active matches error:', error);
        return createResponse(500, { message: 'Error retrieving active matches', error: error.message });
    }
}

export async function getUserStats(event) {
    try {
        // Extract and verify token
        const token = extractAndVerifyToken(event);
        if (!token.isValid) {
            return token.response;
        }

        // Get the requested user's ID from query parameters
        const queryParams = event.queryStringParameters || {};
        const userId = queryParams.userId || token.decoded.userId;

        console.log(`Calculating stats for user: ${userId}`);

        // First, get tournament matches
        const tournamentsDb = await connectToSpecificDatabase('tournaments-db');
        const tournamentMatchesCollection = tournamentsDb.collection('competitiveMatches');
        const tournamentMatchesResults = await tournamentMatchesCollection.find({
            $or: [
                { challengerId: userId },
                { challengeeId: userId },
                { player1: userId },
                { player2: userId }
            ],
            status: 'completed'
        }).toArray();

        // Then, get ladder matches
        const laddersDb = await connectToSpecificDatabase('ladders-db');
        const ladderMatchesCollection = laddersDb.collection('competitiveMatches');
        const ladderMatchesResults = await ladderMatchesCollection.find({
            $or: [
                { challengerId: userId },
                { challengeeId: userId },
                { player1: userId },
                { player2: userId }
            ],
            status: 'completed'
        }).toArray();

        // Combine the results
        const userMatches = [...tournamentMatchesResults, ...ladderMatchesResults];

        console.log(`Found ${userMatches.length} total matches for user ${userId}`);

        // Calculate basic stats
        const totalMatches = userMatches.length;

        // Count wins (where this user is the winner)
        const wins = userMatches.filter(match => match.winner === userId).length;

        // Calculate losses
        const losses = totalMatches - wins;

        // Calculate win rate (protect against division by zero)
        const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

        // Separate tournament and ladder matches
        const tournamentMatchesSet = tournamentMatchesResults;
        const ladderMatchesSet = ladderMatchesResults;

        console.log(`Tournament matches: ${tournamentMatchesSet.length}, Ladder matches: ${ladderMatchesSet.length}`);

        // Get unique tournaments and ladders participated in
        const uniqueTournaments = new Set(tournamentMatchesSet.map(match => match.tournamentId));
        const uniqueLadders = new Set(ladderMatchesSet.map(match => match.ladderId));

        // Tournament stats
        const tournamentWins = tournamentMatchesSet.filter(match => match.winner === userId).length;
        const tournamentWinRate = tournamentMatchesSet.length > 0
            ? Math.round((tournamentWins / tournamentMatchesSet.length) * 100)
            : 0;

        // Ladder stats
        const ladderWins = ladderMatchesSet.filter(match => match.winner === userId).length;

        // Calculate ladder rank improvements
        // A win as a challenger counts as a rank improvement
        const ladderRankImprovements = ladderMatchesSet.filter(
            match => match.winner === userId && match.challengerId === userId
        ).length;

        // Get some recent matches for display (limit to 5)
        const recentMatches = userMatches
            .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
            .slice(0, 5);

        // Create a lookup for opponent names
        const opponentIds = new Set();
        recentMatches.forEach(match => {
            if (match.player1 && match.player1 !== userId) opponentIds.add(match.player1);
            if (match.player2 && match.player2 !== userId) opponentIds.add(match.player2);
            if (match.challengerId && match.challengerId !== userId) opponentIds.add(match.challengerId);
            if (match.challengeeId && match.challengeeId !== userId) opponentIds.add(match.challengeeId);
        });

        // Connect to users database to get names
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Convert to ObjectIds
        const opponentObjectIds = Array.from(opponentIds)
            .map(id => {
                try { return new ObjectId(id); }
                catch (e) { return null; }
            })
            .filter(id => id !== null);

        // Get opponent details
        const opponentDetails = await users.find({
            _id: { $in: opponentObjectIds }
        }).project({
            _id: 1,
            name: 1
        }).toArray();

        // Create lookup map
        const opponentLookup = {};
        opponentDetails.forEach(opponent => {
            opponentLookup[opponent._id.toString()] = opponent.name;
        });

        // Format recent matches for display
        const recentPerformance = recentMatches.map(match => {
            // Determine opponent
            let opponentId = null;
            if (match.player1 && match.player1 !== userId) opponentId = match.player1;
            else if (match.player2 && match.player2 !== userId) opponentId = match.player2;
            else if (match.challengerId && match.challengerId !== userId) opponentId = match.challengerId;
            else if (match.challengeeId && match.challengeeId !== userId) opponentId = match.challengeeId;

            // Match type (tournament or ladder)
            const type = match.tournamentId ? 'tournament' : 'ladder';

            return {
                type: type,
                date: match.completedAt || match.createdAt,
                isWin: match.winner === userId,
                opponent: opponentLookup[opponentId] || 'Unknown Player'
            };
        });

        // Compile all stats
        const stats = {
            totalMatches,
            wins,
            losses,
            winRate,

            tournamentsParticipated: uniqueTournaments.size,
            tournamentMatches: tournamentMatchesSet.length,
            tournamentWins,
            tournamentWinRate,

            laddersParticipated: uniqueLadders.size,
            ladderMatches: ladderMatchesSet.length,
            ladderWins,
            ladderRankImprovements,

            recentPerformance
        };

        console.log(`Stats compiled for user ${userId}`);

        return createResponse(200, { stats });
    } catch (error) {
        console.error('Get user stats error:', error);
        return createResponse(500, { message: 'Error retrieving user stats', error: error.message });
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

