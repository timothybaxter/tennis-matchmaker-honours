// src/handlers/competitiveMatches.mjs
import jwt from 'jsonwebtoken';
import { connectToDatabase, connectToSpecificDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';
import fetch from 'node-fetch';

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

        // Connect to matches database
        const db = await connectToDatabase();
        const matches = db.collection('competitiveMatches');

        // Build query
        const query = {
            $or: [
                { challengerId: userId },
                { challengeeId: userId },
                { player1: userId },
                { player2: userId }
            ],
            status: 'completed'
        };

        // Filter by type if provided
        if (queryParams.type) {
            if (queryParams.type === 'tournament') {
                query.tournamentId = { $exists: true };
            } else if (queryParams.type === 'ladder') {
                query.ladderId = { $exists: true };
            }
        }

        // Filter by context ID if provided
        if (queryParams.contextId) {
            if (queryParams.type === 'tournament') {
                query.tournamentId = queryParams.contextId;
            } else if (queryParams.type === 'ladder') {
                query.ladderId = queryParams.contextId;
            }
        }

        // Get matches with pagination
        const limit = parseInt(queryParams.limit) || 10;
        const skip = parseInt(queryParams.skip) || 0;

        const matchHistory = await matches.find(query)
            .sort({ completedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        console.log(`Found ${matchHistory.length} matches in history`);

        // Get total count for pagination
        const totalMatches = await matches.countDocuments(query);

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
        const tournamentsDb = await connectToSpecificDatabase('tournaments-db');
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
        const laddersDb = await connectToSpecificDatabase('ladders-db');
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
                isWinner: match.winner === userId
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
                enhancedMatch.opponent = match.challengerId === userId
                    ? enhancedMatch.challengee
                    : enhancedMatch.challenger;
            } else if (match.player1Details && match.player2Details) {
                enhancedMatch.opponent = match.player1 === userId
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

        // Enhance match with details
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
        console.log(`Looking for matches for user: ${userId}`);
        const queryParams = event.queryStringParameters || {};

        // Initialize combined matches array
        let allMatches = [];

        // 1. Get tournament matches
        try {
            const tournamentsDb = await connectToSpecificDatabase('tournaments-db');
            console.log(`Connected to tournaments database: ${tournamentsDb.databaseName}`);
            const tournamentMatches = tournamentsDb.collection('competitiveMatches');

            // Build query for tournament matches
            const tournamentQuery = {
                $or: [
                    { player1: userId },
                    { player2: userId },
                    { participants: userId } // Check participants array too
                ],
                status: { $in: ['scheduled', 'accepted'] }
            };

            const activeTournamentMatches = await tournamentMatches.find(tournamentQuery)
                .sort({ createdAt: -1 })
                .toArray();

            console.log(`Found ${activeTournamentMatches.length} tournament matches`);

            // Mark the source of these matches
            const enhancedTournamentMatches = activeTournamentMatches.map(match => ({
                ...match,
                id: match._id.toString(),
                matchSource: 'tournament'
            }));

            allMatches = [...allMatches, ...enhancedTournamentMatches];
        } catch (error) {
            console.error('Error getting tournament matches:', error);
        }

        // 2. Get ladder matches
        try {
            const laddersDb = await connectToSpecificDatabase('ladders-db');
            console.log(`Connected to ladders database: ${laddersDb.databaseName}`);
            const ladderMatches = laddersDb.collection('competitiveMatches');

            // Build query for ladder matches
            const ladderQuery = {
                $or: [
                    { challengerId: userId },
                    { challengeeId: userId },
                    { player1: userId },
                    { player2: userId },
                    { participants: userId } // Check participants array too
                ],
                status: { $in: ['scheduled', 'accepted'] }
            };

            const activeLadderMatches = await ladderMatches.find(ladderQuery)
                .sort({ createdAt: -1 })
                .toArray();

            console.log(`Found ${activeLadderMatches.length} ladder matches`);

            // Mark the source of these matches
            const enhancedLadderMatches = activeLadderMatches.map(match => ({
                ...match,
                id: match._id.toString(),
                matchSource: 'ladder'
            }));

            allMatches = [...allMatches, ...enhancedLadderMatches];
        } catch (error) {
            console.error('Error getting ladder matches:', error);
        }

        // 3. Get casual matches
        try {
            const casualDb = await connectToSpecificDatabase('matches-db');
            console.log(`Connected to casual matches database: ${casualDb.databaseName}`);
            const casualMatches = casualDb.collection('matches');

            const casualQuery = {
                $or: [
                    { creatorId: userId },
                    { participants: userId }
                ],
                status: { $in: ['open', 'scheduled', 'accepted'] }
            };

            const activeCasualMatches = await casualMatches.find(casualQuery)
                .sort({ matchTime: 1 })
                .toArray();

            console.log(`Found ${activeCasualMatches.length} casual matches`);

            // Mark the source of these matches
            const enhancedCasualMatches = activeCasualMatches.map(match => ({
                ...match,
                id: match._id.toString(),
                matchSource: 'casual'
            }));

            allMatches = [...allMatches, ...enhancedCasualMatches];
        } catch (error) {
            console.error('Error getting casual matches:', error);
        }

        console.log(`Total matches found: ${allMatches.length}`);

        if (allMatches.length === 0) {
            return createResponse(200, { matches: [] });
        }

        // Get user details for all participants
        const usersDb = await connectToSpecificDatabase('users-db');
        const users = usersDb.collection('users');

        // Extract all user IDs from matches
        const userIds = new Set();
        allMatches.forEach(match => {
            if (match.creatorId) userIds.add(match.creatorId);
            if (match.challengerId) userIds.add(match.challengerId);
            if (match.challengeeId) userIds.add(match.challengeeId);
            if (match.player1) userIds.add(match.player1);
            if (match.player2) userIds.add(match.player2);
            // For matches with participants array
            if (match.participants && Array.isArray(match.participants)) {
                match.participants.forEach(id => userIds.add(id));
            }
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

        // Get tournament and ladder details
        const contextIds = {
            tournaments: new Set(),
            ladders: new Set()
        };

        allMatches.forEach(match => {
            if (match.tournamentId) contextIds.tournaments.add(match.tournamentId);
            if (match.ladderId) contextIds.ladders.add(match.ladderId);
        });

        // Get tournament details
        const tournamentLookup = {};
        if (contextIds.tournaments.size > 0) {
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

            tournamentDetails.forEach(tournament => {
                tournamentLookup[tournament._id.toString()] = {
                    id: tournament._id.toString(),
                    name: tournament.name,
                    format: tournament.format
                };
            });
        }

        // Get ladder details
        const ladderLookup = {};
        if (contextIds.ladders.size > 0) {
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

            ladderDetails.forEach(ladder => {
                ladderLookup[ladder._id.toString()] = {
                    id: ladder._id.toString(),
                    name: ladder.name
                };
            });
        }

        // Enhance match details
        const enhancedMatches = allMatches.map(match => {
            const enhancedMatch = { ...match };

            // Add tournament details
            if (match.tournamentId && tournamentLookup[match.tournamentId]) {
                enhancedMatch.tournament = tournamentLookup[match.tournamentId];
            }

            // Add ladder details
            if (match.ladderId && ladderLookup[match.ladderId]) {
                enhancedMatch.ladder = ladderLookup[match.ladderId];
            }

            // Add player details based on match source
            if (match.matchSource === 'tournament') {
                if (match.player1 && userLookup[match.player1]) {
                    enhancedMatch.player1Details = userLookup[match.player1];
                }
                if (match.player2 && userLookup[match.player2]) {
                    enhancedMatch.player2Details = userLookup[match.player2];
                }
                // Determine opponent
                if (match.player1 === userId && match.player2 && userLookup[match.player2]) {
                    enhancedMatch.opponent = userLookup[match.player2];
                } else if (match.player2 === userId && match.player1 && userLookup[match.player1]) {
                    enhancedMatch.opponent = userLookup[match.player1];
                }
            }
            else if (match.matchSource === 'ladder') {
                if (match.challengerId && userLookup[match.challengerId]) {
                    enhancedMatch.challenger = userLookup[match.challengerId];
                }
                if (match.challengeeId && userLookup[match.challengeeId]) {
                    enhancedMatch.challengee = userLookup[match.challengeeId];
                }
                // Determine opponent
                if (match.challengerId === userId && match.challengeeId && userLookup[match.challengeeId]) {
                    enhancedMatch.opponent = userLookup[match.challengeeId];
                } else if (match.challengeeId === userId && match.challengerId && userLookup[match.challengerId]) {
                    enhancedMatch.opponent = userLookup[match.challengerId];
                }
            }
            else if (match.matchSource === 'casual') {
                // For casual matches, set the opponent to the creator if the user isn't the creator
                if (match.creatorId && match.creatorId !== userId && userLookup[match.creatorId]) {
                    enhancedMatch.opponent = userLookup[match.creatorId];
                } else {
                    // Fallback to posterName if available
                    enhancedMatch.opponent = {
                        name: match.posterName,
                        playerLevel: match.skillLevel || 'Unknown'
                    };
                }
            }

            // Calculate time remaining
            if (match.deadline) {
                const now = new Date();
                const deadline = new Date(match.deadline);
                const timeRemaining = deadline - now;

                enhancedMatch.timeRemaining = Math.max(0, timeRemaining);
                enhancedMatch.isExpired = timeRemaining <= 0;
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

