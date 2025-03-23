// src/handlers/deadline-checker.mjs
import { connectToDatabase, connectToSpecificDatabase } from '../utils/database.mjs';
import { createResponse } from '../utils/responses.mjs';
import { ObjectId } from 'mongodb';
import fetch from 'node-fetch';

// Main handler for the deadline checker Lambda function
export const handler = async (event) => {
    try {
        console.log('Deadline checker started');

        // If it's coming from API Gateway
        if (event.httpMethod) {
            // Verify JWT token if present
            if (event.headers && (event.headers.Authorization || event.headers.authorization)) {
                const authHeader = event.headers.Authorization || event.headers.authorization;
                if (!authHeader.startsWith('Bearer ')) {
                    return createResponse(401, { message: 'Invalid authorization format' });
                }

                // Actual token validation happens inside the functions
            }

            // Process tournaments and ladder deadlines
            const tournamentResults = await checkTournamentDeadlines();
            const ladderResults = await checkLadderDeadlines();

            // Return results
            return createResponse(200, {
                message: 'Deadline check completed',
                tournamentMatches: tournamentResults.processed,
                ladderMatches: ladderResults.processed,
                timestamp: new Date().toISOString()
            });
        }

        // If not from API Gateway (direct Lambda invocation)
        const tournamentResults = await checkTournamentDeadlines();
        const ladderResults = await checkLadderDeadlines();

        return {
            message: 'Deadline check completed',
            tournamentMatches: tournamentResults.processed,
            ladderMatches: ladderResults.processed
        };
    } catch (error) {
        console.error('Error in deadline checker:', error);

        // If it's from API Gateway
        if (event.httpMethod) {
            return createResponse(500, { message: 'Error checking deadlines', error: error.message });
        }

        // If direct Lambda invocation
        return {
            error: 'Error checking deadlines',
            message: error.message
        };
    }
};

// Check tournament matches with expired deadlines
async function checkTournamentDeadlines() {
    try {
        console.log('Checking tournament deadlines...');

        // Connect to tournaments database
        const tournamentsDb = await connectToSpecificDatabase('tournaments-db');
        const matches = tournamentsDb.collection('competitiveMatches');
        const tournaments = tournamentsDb.collection('tournaments');

        // Find tournament matches with expired deadlines that aren't completed/disputed
        const now = new Date();
        const expiredMatches = await matches.find({
            deadline: { $lt: now },
            status: { $in: ['scheduled', 'accepted'] },
            tournamentId: { $exists: true }
        }).toArray();

        console.log(`Found ${expiredMatches.length} expired tournament matches`);

        for (const match of expiredMatches) {
            await handleExpiredTournamentMatch(match, tournaments, matches);
        }

        return { processed: expiredMatches.length };
    } catch (error) {
        console.error('Error checking tournament deadlines:', error);
        throw error;
    }
}

// Check ladder matches with expired deadlines
async function checkLadderDeadlines() {
    try {
        console.log('Checking ladder deadlines...');

        // Connect to ladders database
        const laddersDb = await connectToSpecificDatabase('ladders-db');
        const matches = laddersDb.collection('competitiveMatches');
        const ladders = laddersDb.collection('ladders');

        // Find ladder matches with expired deadlines that aren't completed/disputed
        const now = new Date();
        const expiredMatches = await matches.find({
            deadline: { $lt: now },
            status: { $in: ['scheduled', 'accepted'] },
            ladderId: { $exists: true }
        }).toArray();

        console.log(`Found ${expiredMatches.length} expired ladder matches`);

        for (const match of expiredMatches) {
            await handleExpiredLadderMatch(match, matches, ladders);
        }

        return { processed: expiredMatches.length };
    } catch (error) {
        console.error('Error checking ladder deadlines:', error);
        throw error;
    }
}

// Handle an expired tournament match
async function handleExpiredTournamentMatch(match, tournaments, matches) {
    try {
        console.log(`Processing expired tournament match: ${match._id}`);

        // 1. Mark match as expired
        await matches.updateOne(
            { _id: match._id },
            {
                $set: {
                    status: 'expired',
                    expiredAt: new Date(),
                    resolution: 'players_removed',
                    systemMessage: 'Match expired due to deadline passing without result'
                }
            }
        );

        // 2. Get tournament
        const tournament = await tournaments.findOne({
            _id: new ObjectId(match.tournamentId)
        });

        if (!tournament) {
            console.error(`Tournament not found for match ${match._id}`);
            return;
        }

        // 3. Calculate the next match number
        const nextMatchNumber = Math.floor((match.matchNumber - 1) / 2) + 1;
        const currentRound = match.round;
        const nextRound = currentRound + 1;

        // Adjust next match number based on tournament structure
        let nextRealMatchNumber = nextMatchNumber;
        if (currentRound > 1) {
            // For non-first rounds, calculate the actual match number
            const matchesInPreviousRound = Math.pow(2, tournament.bracket.numRounds - currentRound + 1);
            nextRealMatchNumber = Math.floor((match.matchNumber - 1) / 2) + 1 + matchesInPreviousRound / 2;
        } else {
            // For first round matches
            nextRealMatchNumber = Math.floor((match.matchNumber - 1) / 2) + 1 + Math.pow(2, tournament.bracket.numRounds - 2);
        }

        // Determine if this is a right or left branch match
        const isRightBranch = match.matchNumber % 2 === 0;
        const playerPosition = isRightBranch ? 'player2' : 'player1';

        // 4. Find the sibling match that feeds into the same next match
        const siblingMatchNumber = isRightBranch ? match.matchNumber - 1 : match.matchNumber + 1;
        const siblingMatch = await matches.findOne({
            tournamentId: match.tournamentId,
            matchNumber: siblingMatchNumber,
            round: currentRound
        });

        // 5. Handle tournament bracket updates
        if (siblingMatch && siblingMatch.status === 'completed') {
            // The sibling match has a winner, advance them with a bye
            const byePlayer = siblingMatch.winner;

            // Update tournament bracket to advance the player
            await tournaments.updateOne(
                { _id: new ObjectId(match.tournamentId) },
                {
                    $set: {
                        [`bracket.rounds.${nextRound - 1}.matches.$[elem].${playerPosition === 'player1' ? 'player2' : 'player1'}`]: { id: byePlayer }
                    }
                },
                {
                    arrayFilters: [{ "elem.matchNumber": nextRealMatchNumber }]
                }
            );

            // 6. Create a bye match in the next round if needed
            const nextMatch = await matches.findOne({
                tournamentId: match.tournamentId,
                round: nextRound,
                matchNumber: nextRealMatchNumber
            });

            if (!nextMatch) {
                // Create a bye match with automatic advancement
                const matchDeadline = new Date();
                matchDeadline.setHours(matchDeadline.getHours() + tournament.challengeWindow);

                const newMatch = {
                    tournamentId: match.tournamentId,
                    matchNumber: nextRealMatchNumber,
                    round: nextRound,
                    player1: playerPosition === 'player1' ? null : byePlayer,
                    player2: playerPosition === 'player2' ? null : byePlayer,
                    winner: byePlayer,
                    scores: [],
                    status: 'completed',
                    isByeMatch: true,
                    createdAt: new Date(),
                    completedAt: new Date(),
                    deadline: matchDeadline,
                    player1Submitted: true,
                    player2Submitted: true,
                    resolution: 'automatic_bye'
                };

                await matches.insertOne(newMatch);
                console.log(`Created bye match in round ${nextRound}`);

                // Continue advancing through the bracket if needed
                await advanceWinner(match.tournamentId, newMatch, byePlayer, tournaments, matches);
            }
        } else {
            // Both matches in this branch are expired, create empty slot in next round
            await tournaments.updateOne(
                { _id: new ObjectId(match.tournamentId) },
                {
                    $set: {
                        [`bracket.rounds.${nextRound - 1}.matches.$[elem].player1`]: null,
                        [`bracket.rounds.${nextRound - 1}.matches.$[elem].player2`]: null
                    }
                },
                {
                    arrayFilters: [{ "elem.matchNumber": nextRealMatchNumber }]
                }
            );
        }

        // 7. Send notifications to players
        await sendExpiredMatchNotifications(match, 'tournament');

        console.log(`Successfully processed expired tournament match ${match._id}`);
    } catch (error) {
        console.error(`Error handling expired tournament match ${match._id}:`, error);
    }
}

// Handle an expired ladder match
async function handleExpiredLadderMatch(match, matches, ladders) {
    try {
        console.log(`Processing expired ladder match: ${match._id}`);

        // Mark the match as disputed
        await matches.updateOne(
            { _id: match._id },
            {
                $set: {
                    status: 'disputed',
                    disputedAt: new Date(),
                    disputeReason: 'deadline_expired',
                    systemMessage: 'Match marked as disputed due to deadline passing without result'
                }
            }
        );

        // Get the ladder to notify the admin
        const ladder = await ladders.findOne({
            _id: new ObjectId(match.ladderId)
        });

        if (!ladder) {
            console.error(`Ladder not found for match ${match._id}`);
            return;
        }

        // Send notifications
        await sendExpiredMatchNotifications(match, 'ladder', ladder.creatorId);

        console.log(`Successfully processed expired ladder match ${match._id}`);
    } catch (error) {
        console.error(`Error handling expired ladder match ${match._id}:`, error);
    }
}

// Advance winners in tournament brackets
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
        let nextMatchNumber = Math.floor((match.matchNumber - 1) / 2) + 1;

        if (currentRound > 1) {
            // For rounds beyond the first, calculate based on the previous round's match count
            const matchesInPreviousRound = Math.pow(2, bracket.numRounds - currentRound + 1);
            nextMatchNumber = Math.floor((match.matchNumber - 1) / 2) + 1 + matchesInPreviousRound / 2;
        } else {
            // For first round matches, simpler calculation
            nextMatchNumber = Math.floor((match.matchNumber - 1) / 2) + 1 + Math.pow(2, bracket.numRounds - 2);
        }

        // Determine if this match feeds into player1 or player2 slot
        const playerPosition = match.matchNumber % 2 === 1 ? 'player1' : 'player2';

        // Find the next match in the bracket
        const nextRoundMatches = bracket.rounds[nextRound - 1].matches;
        const nextMatch = nextRoundMatches.find(m => m.matchNumber === nextMatchNumber);

        if (!nextMatch) {
            console.error(`Could not find next match ${nextMatchNumber} for advancing from match ${match.matchNumber}`);
            return;
        }

        // Update the bracket structure - update current match winner
        const updatePath = `bracket.rounds.${currentRound - 1}.matches`;
        const matchIndex = bracket.rounds[currentRound - 1].matches.findIndex(m => m.matchNumber === match.matchNumber);

        if (matchIndex === -1) {
            console.error(`Could not find match ${match.matchNumber} in round ${currentRound}`);
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
            console.error(`Could not find next match ${nextMatch.matchNumber} in round ${nextRound}`);
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

        console.log(`Advanced player ${winnerId} to match ${nextMatchNumber} as ${playerPosition}`);

        // Check if both players for the next match are now set
        const updatedTournament = await tournaments.findOne({ _id: new ObjectId(tournamentId) });
        const updatedNextMatch = updatedTournament.bracket.rounds[nextRound - 1].matches[nextMatchIndex];

        if (updatedNextMatch.player1 && updatedNextMatch.player2) {
            // Both players are now set, create the next match
            const matchDeadline = new Date();
            matchDeadline.setHours(matchDeadline.getHours() + tournament.challengeWindow);

            // Check if this is yet another bye match (same player in both slots)
            const isByeMatch = updatedNextMatch.player1.id === updatedNextMatch.player2.id;
            let status = 'scheduled';
            let winner = null;
            let player1Submitted = false;
            let player2Submitted = false;
            let completedAt = null;

            if (isByeMatch) {
                // If same player in both slots (shouldn't happen but checking anyway)
                status = 'completed';
                winner = updatedNextMatch.player1.id;
                player1Submitted = true;
                player2Submitted = true;
                completedAt = new Date();
                console.log(`WARNING: Same player in both slots of match ${updatedNextMatch.matchNumber}`);
            }

            const newMatch = {
                tournamentId: tournamentId,
                matchNumber: updatedNextMatch.matchNumber,
                round: nextRound,
                player1: updatedNextMatch.player1.id,
                player2: updatedNextMatch.player2.id,
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

            const result = await matches.insertOne(newMatch);

            // If this was another bye match, immediately advance the winner
            if (isByeMatch) {
                await advanceWinner(tournamentId, newMatch, winner, tournaments, matches);
                console.log(`Auto-advanced player ${winner} from match ${newMatch.matchNumber} (identical players)`);
                return;
            }

            // Notify both players about their new match
            try {
                const usersDb = await connectToSpecificDatabase('users-db');
                const users = usersDb.collection('users');

                for (const playerId of [updatedNextMatch.player1.id, updatedNextMatch.player2.id]) {
                    const opponentId = playerId === updatedNextMatch.player1.id ? updatedNextMatch.player2.id : updatedNextMatch.player1.id;
                    const opponentData = await users.findOne({ _id: new ObjectId(opponentId) });

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

                    await sendNotification(notificationRequest);
                }
            } catch (notificationError) {
                console.error('Error sending new match notifications:', notificationError);
            }
        }
    } catch (error) {
        console.error('Error advancing winner:', error);
    }
}

// Send notifications for expired matches
async function sendExpiredMatchNotifications(match, matchType, adminId = null) {
    try {
        // Notify players
        const recipients = [];

        if (matchType === 'tournament') {
            if (match.player1) recipients.push(match.player1);
            if (match.player2) recipients.push(match.player2);
        } else if (matchType === 'ladder') {
            if (match.challengerId) recipients.push(match.challengerId);
            if (match.challengeeId) recipients.push(match.challengeeId);

            // Notify ladder admin
            if (adminId) recipients.push(adminId);
        }

        // Get context details (tournament or ladder name)
        let contextName = "";
        try {
            if (matchType === 'tournament') {
                const tournamentsDb = await connectToSpecificDatabase('tournaments-db');
                const tournaments = tournamentsDb.collection('tournaments');
                const tournament = await tournaments.findOne({ _id: new ObjectId(match.tournamentId) });
                if (tournament) {
                    contextName = tournament.name;
                }
            } else if (matchType === 'ladder') {
                const laddersDb = await connectToSpecificDatabase('ladders-db');
                const ladders = laddersDb.collection('ladders');
                const ladder = await ladders.findOne({ _id: new ObjectId(match.ladderId) });
                if (ladder) {
                    contextName = ladder.name;
                }
            }
        } catch (error) {
            console.error('Error getting context name:', error);
        }

        // Send notifications to all recipients
        for (const recipientId of recipients) {
            // Prepare notification
            const notificationRequest = {
                recipientId,
                senderId: 'system',
                senderName: 'System',
                type: matchType === 'tournament' ? 'tournament_match_expired' : 'ladder_match_disputed',
                content: matchType === 'tournament'
                    ? `Your match in tournament "${contextName}" has expired due to no result being submitted in time. You have been removed from the tournament.`
                    : `Your match in ladder "${contextName}" has been marked as disputed due to no result being submitted in time.`,
                [matchType + 'Id']: matchType === 'tournament' ? match.tournamentId : match.ladderId,
                matchId: match._id.toString()
            };

            await sendNotification(notificationRequest);
        }
    } catch (error) {
        console.error('Error sending expired match notifications:', error);
    }
}

// Send a notification
async function sendNotification(notificationData) {
    try {
        if (!process.env.NOTIFICATION_API_URL) {
            console.log('Notification API URL not set, skipping notification');
            return;
        }

        console.log('Sending notification:', JSON.stringify(notificationData));

        const response = await fetch(process.env.NOTIFICATION_API_URL + '/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.API_KEY || ''}`
            },
            body: JSON.stringify(notificationData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error sending notification: ${response.status} - ${errorText}`);
        }
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}