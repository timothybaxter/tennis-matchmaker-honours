using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using TennisMatchmakingSite2.Hubs;

namespace TennisMatchmakingSite2.Services
{
    public class NotificationService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<NotificationService> _logger;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IHubContext<TennisMatchmakerHub> _hubContext;
        private readonly string _apiBaseUrl;

        public NotificationService(
            IConfiguration configuration,
            ILogger<NotificationService> logger,
            IHttpContextAccessor httpContextAccessor,
            IHubContext<TennisMatchmakerHub> hubContext)
        {
            _logger = logger;
            _httpContextAccessor = httpContextAccessor;
            _hubContext = hubContext;
            _apiBaseUrl = configuration["ApiBaseUrl"] ?? throw new InvalidOperationException("ApiBaseUrl not configured");
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(_apiBaseUrl)
            };
        }

        /// <summary>
        /// Core method to create a notification for a user with both database storage and real-time delivery
        /// </summary>
        public async Task<bool> CreateNotificationAsync(
            string recipientId,
            string type,
            string content,
            string relatedItemId = null,
            string sourceUserId = null,
            Dictionary<string, string> metadata = null)
        {
            try
            {
                if (string.IsNullOrEmpty(recipientId))
                {
                    _logger.LogWarning("Cannot create notification: Recipient ID is missing");
                    return false;
                }

                var token = _httpContextAccessor.HttpContext?.Session.GetString("JWTToken");
                if (string.IsNullOrEmpty(token))
                {
                    _logger.LogWarning("Cannot create notification: No JWT token available");
                    return false;
                }

                // If sourceUserId not provided, use current user ID
                if (string.IsNullOrEmpty(sourceUserId))
                {
                    sourceUserId = _httpContextAccessor.HttpContext?.Session.GetString("UserId");
                }

                // Get source user name (for real-time notification)
                string sourceUserName = _httpContextAccessor.HttpContext?.Session.GetString("UserName") ?? "Unknown User";

                // Create notification object with optional metadata
                var notification = new
                {
                    recipientId,
                    type,
                    content,
                    relatedItemId,
                    sourceUserId,
                    metadata
                };

                _logger.LogDebug("Creating notification of type '{NotificationType}' for user {RecipientId}", type, recipientId);

                // 1. Store notification in database
                var dbRequest = new HttpRequestMessage(HttpMethod.Post, "notifications");
                dbRequest.Headers.Add("Authorization", "Bearer " + token);
                dbRequest.Content = JsonContent.Create(notification);

                var dbResponse = await _httpClient.SendAsync(dbRequest);
                var dbSuccess = dbResponse.IsSuccessStatusCode;

                if (!dbSuccess)
                {
                    var responseContent = await dbResponse.Content.ReadAsStringAsync();
                    _logger.LogError("Failed to create database notification of type '{NotificationType}': {StatusCode} - {Response}",
                        type, dbResponse.StatusCode, responseContent);
                }

                // 2. Send real-time notification directly via SignalR
                bool rtSuccess = await SendDirectRealTimeNotification(
                    recipientId,
                    type,
                    content,
                    relatedItemId,
                    sourceUserId,
                    sourceUserName,
                    metadata);

                // Log overall result
                if (dbSuccess && rtSuccess)
                {
                    _logger.LogInformation("Successfully created notification with real-time delivery for user {RecipientId}", recipientId);
                    return true;
                }
                else if (dbSuccess)
                {
                    _logger.LogWarning("Created database notification but real-time delivery failed for user {RecipientId}", recipientId);
                    return true; // Still return true since database notification was created
                }
                else
                {
                    _logger.LogError("Failed to create notification for user {RecipientId}", recipientId);
                    return false;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating notification of type '{NotificationType}' for user {RecipientId}",
                    type, recipientId);
                return false;
            }
        }

        /// <summary>
        /// Sends real-time notifications directly through SignalR without using external APIs
        /// </summary>
        private async Task<bool> SendDirectRealTimeNotification(
    string recipientId,
    string type,
    string content,
    string relatedItemId,
    string sourceUserId,
    string sourceUserName,
    Dictionary<string, string> metadata = null)
        {
            try
            {
                _logger.LogInformation($"Sending direct SignalR notification of type '{type}' to user {recipientId}");

                // Create a user-friendly title from the type
                string title = GetFriendlyTitleFromType(type);

                // Create common notification object
                var notificationData = new
                {
                    type = type,
                    title = title,
                    message = content,
                    timestamp = DateTime.UtcNow,
                    relatedItemId = relatedItemId,
                    source = new
                    {
                        userId = sourceUserId,
                        name = sourceUserName
                    },
                    metadata = metadata
                };

                // IMPORTANT: Only send ONE notification type - NOT BOTH
                try
                {
                    // SEND EITHER specific type OR generic, BUT NOT BOTH
                    if (type.StartsWith("message"))
                    {
                        var messageData = new
                        {
                            conversationId = relatedItemId,
                            senderId = sourceUserId,
                            senderName = sourceUserName,
                            content = content,
                            timestamp = DateTime.UtcNow
                        };

                        // ONLY send message-specific notification, NOT generic
                        await _hubContext.Clients.Group($"user_{recipientId}").SendAsync("ReceiveMessage", messageData);
                        _logger.LogInformation($"Sent message notification to user group user_{recipientId}");
                    }
                    else if (type.StartsWith("friend_"))
                    {
                        // Friend request specific notification
                        var friendData = new
                        {
                            friendshipId = relatedItemId,
                            senderId = sourceUserId,
                            senderName = sourceUserName,
                            recipientId = recipientId,
                            timestamp = DateTime.UtcNow
                        };

                        await _hubContext.Clients.Group($"user_{recipientId}").SendAsync("ReceiveFriendRequest", friendData);
                    }
                    else
                    {
                        // For other types, use generic notification
                        await _hubContext.Clients.Group($"user_{recipientId}").SendAsync("ReceiveNotification", notificationData);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error sending notification via SignalR");
                    return false;
                }

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending direct SignalR notification");
                return false;
            }
        }
        // Helper method to convert notification types to friendly titles
        private string GetFriendlyTitleFromType(string type)
        {
            return type switch
            {
                "friend_request" => "Friend Request",
                "friend_accepted" => "Friend Request Accepted",
                "friend_rejected" => "Friend Request Declined",
                "message" => "New Message",
                "match_invite" => "Match Invitation",
                "match_edited" => "Match Updated",
                "match_deleted" => "Match Cancelled",
                "match_joined" => "Player Joined Match",
                "match_request" => "Match Join Request",
                "tournament_invite" => "Tournament Invitation",
                "tournament_match_scheduled" => "Tournament Match Scheduled",
                "tournament_match_result" => "Tournament Match Result",
                "tournament_completed" => "Tournament Completed",
                "ladder_challenge" => "Ladder Challenge",
                _ => "Notification"
            };
        }

        #region Friend Notifications

        /// <summary>
        /// Notifies a user that they received a friend request
        /// </summary>
        public async Task<bool> SendFriendRequestNotification(
            string recipientId,
            string senderName,
            string friendshipId)
        {
            return await CreateNotificationAsync(
                recipientId,
                "friend_request",
                $"{senderName} sent you a friend request",
                friendshipId);
        }

        /// <summary>
        /// Notifies a user that their friend request was accepted
        /// </summary>
        public async Task<bool> SendFriendRequestAcceptedNotification(
            string recipientId,
            string accepterName,
            string friendshipId)
        {
            return await CreateNotificationAsync(
                recipientId,
                "friend_accepted",
                $"{accepterName} accepted your friend request",
                friendshipId);
        }

        /// <summary>
        /// Notifies a user that their friend request was declined
        /// </summary>
        public async Task<bool> SendFriendRequestDeclinedNotification(
            string recipientId,
            string declinerName)
        {
            return await CreateNotificationAsync(
                recipientId,
                "friend_rejected",
                $"{declinerName} declined your friend request",
                null);
        }

        #endregion

        #region Message Notifications

        /// <summary>
        /// Notifies a user that they received a new message
        /// </summary>
        public async Task<bool> SendMessageNotification(
            string recipientId,
            string senderName,
            string conversationId,
            string messagePreview = null)
        {
            string content = string.IsNullOrEmpty(messagePreview)
                ? $"{senderName} sent you a message"
                : $"{senderName}: {messagePreview}";

            return await CreateNotificationAsync(
                recipientId,
                "message",
                content,
                conversationId);
        }

        #endregion

        #region Match Notifications

        /// <summary>
        /// Notifies a user that they've been invited to a match
        /// </summary>
        public async Task<bool> SendMatchInviteNotification(
            string recipientId,
            string senderName,
            string matchId,
            string matchLocation = null)
        {
            string location = string.IsNullOrEmpty(matchLocation)
                ? "a match"
                : $"a match at {matchLocation}";

            return await CreateNotificationAsync(
                recipientId,
                "match_invite",
                $"{senderName} invited you to {location}",
                matchId);
        }

        /// <summary>
        /// Notifies a user that a match has been edited by the host
        /// </summary>
        public async Task<bool> SendMatchEditedNotification(
            string recipientId,
            string hostName,
            string matchId,
            string matchLocation = null)
        {
            string location = string.IsNullOrEmpty(matchLocation)
                ? "a match"
                : $"the match at {matchLocation}";

            return await CreateNotificationAsync(
                recipientId,
                "match_edited",
                $"{hostName} has updated {location}",
                matchId);
        }

        /// <summary>
        /// Notifies a user that a match has been deleted
        /// </summary>
        public async Task<bool> SendMatchDeletedNotification(
            string recipientId,
            string hostName,
            string matchLocation)
        {
            return await CreateNotificationAsync(
                recipientId,
                "match_deleted",
                $"{hostName} has cancelled the match at {matchLocation}",
                null); // No matchId as it's been deleted
        }

        /// <summary>
        /// Notifies a host that a new participant has joined their match
        /// </summary>
        public async Task<bool> SendParticipantJoinedNotification(
            string hostId,
            string participantName,
            string matchId,
            string matchLocation = null)
        {
            string location = string.IsNullOrEmpty(matchLocation)
                ? "your match"
                : $"your match at {matchLocation}";

            return await CreateNotificationAsync(
                hostId,
                "match_joined",
                $"{participantName} has joined {location}",
                matchId);
        }

        /// <summary>
        /// Notifies a host that they've received a new match request
        /// </summary>
        public async Task<bool> SendMatchRequestNotification(
            string hostId,
            string requesterName,
            string matchId,
            string matchLocation = null)
        {
            string location = string.IsNullOrEmpty(matchLocation)
                ? "your match"
                : $"your match at {matchLocation}";

            return await CreateNotificationAsync(
                hostId,
                "match_request",
                $"{requesterName} has requested to join {location}",
                matchId);
        }

        #endregion

        #region Tournament Notifications

        /// <summary>
        /// Notifies a user about a tournament invitation
        /// </summary>
        public async Task<bool> SendTournamentInviteNotification(
            string recipientId,
            string senderName,
            string tournamentId,
            string tournamentName)
        {
            return await CreateNotificationAsync(
                recipientId,
                "tournament_invite",
                $"{senderName} invited you to join the tournament \"{tournamentName}\"",
                tournamentId);
        }

        /// <summary>
        /// Notifies a tournament organizer that someone has accepted their invitation
        /// </summary>
        public async Task<bool> SendTournamentInvitationAcceptedNotification(
            string organizerId,
            string respondentName,
            string tournamentId,
            string tournamentName)
        {
            return await CreateNotificationAsync(
                organizerId,
                "tournament_invitation_accepted",
                $"{respondentName} has accepted your invitation to join \"{tournamentName}\"",
                tournamentId);
        }

        /// <summary>
        /// Notifies a tournament organizer that someone has declined their invitation
        /// </summary>
        public async Task<bool> SendTournamentInvitationDeclinedNotification(
            string organizerId,
            string respondentName,
            string tournamentId,
            string tournamentName)
        {
            return await CreateNotificationAsync(
                organizerId,
                "tournament_invitation_rejected",
                $"{respondentName} has declined your invitation to join \"{tournamentName}\"",
                tournamentId);
        }

        /// <summary>
        /// Notifies a user that a tournament invitation has been cancelled
        /// </summary>
        public async Task<bool> SendTournamentInvitationCancelledNotification(
            string recipientId,
            string organizerName,
            string tournamentId,
            string tournamentName)
        {
            return await CreateNotificationAsync(
                recipientId,
                "tournament_invitation_cancelled",
                $"{organizerName} has cancelled your invitation to \"{tournamentName}\"",
                tournamentId);
        }

        /// <summary>
        /// Notifies a tournament organizer when a player joins their tournament
        /// </summary>
        public async Task<bool> SendTournamentPlayerJoinedNotification(
            string organizerId,
            string playerName,
            string tournamentId,
            string tournamentName)
        {
            return await CreateNotificationAsync(
                organizerId,
                "tournament_player_joined",
                $"{playerName} has joined your tournament \"{tournamentName}\"",
                tournamentId);
        }

        /// <summary>
        /// Notifies a user when a tournament they're in has started
        /// </summary>
        public async Task<bool> SendTournamentStartedNotification(
            string recipientId,
            string organizerName,
            string tournamentId,
            string tournamentName)
        {
            return await CreateNotificationAsync(
                recipientId,
                "tournament_started",
                $"The tournament \"{tournamentName}\" organized by {organizerName} has started",
                tournamentId);
        }

        /// <summary>
        /// Notifies a user when their tournament match is scheduled
        /// </summary>
        public async Task<bool> SendTournamentMatchScheduledNotification(
            string recipientId,
            string opponentName,
            string tournamentId,
            string tournamentName,
            string matchId)
        {
            return await CreateNotificationAsync(
                recipientId,
                "tournament_match_scheduled",
                $"Your match against {opponentName} in the tournament \"{tournamentName}\" has been scheduled",
                matchId,
                null,
                new Dictionary<string, string> { { "tournamentId", tournamentId } });
        }

        /// <summary>
        /// Notifies a user about a tournament match result
        /// </summary>
        public async Task<bool> SendTournamentMatchResultNotification(
            string recipientId,
            string opponentName,
            bool isWinner,
            string tournamentId,
            string tournamentName,
            string matchId)
        {
            string message = isWinner
                ? $"You won your match against {opponentName} in \"{tournamentName}\""
                : $"Your match against {opponentName} in \"{tournamentName}\" has been completed";

            _logger.LogInformation("Sending tournament match result notification to {RecipientId} (Winner: {IsWinner})",
                recipientId, isWinner);

            return await CreateNotificationAsync(
                recipientId,
                "tournament_match_result",
                message,
                matchId,
                null,
                new Dictionary<string, string> {
                    { "tournamentId", tournamentId },
                    { "isWinner", isWinner.ToString() }
                });
        }

        /// <summary>
        /// Notifies a user when a tournament has completed
        /// </summary>
        public async Task<bool> SendTournamentCompletedNotification(
            string recipientId,
            string tournamentId,
            string tournamentName,
            string winnerName,
            bool isWinner)
        {
            string message = isWinner
                ? $"Congratulations! You won the tournament \"{tournamentName}\""
                : $"The tournament \"{tournamentName}\" has ended. {winnerName} is the winner";

            return await CreateNotificationAsync(
                recipientId,
                "tournament_completed",
                message,
                tournamentId,
                null,
                new Dictionary<string, string> { { "isWinner", isWinner.ToString() } });
        }

        #endregion

        #region Ladder Notifications

        /// <summary>
        /// Notifies a user about a ladder invitation
        /// </summary>
        public async Task<bool> SendLadderInviteNotification(
            string recipientId,
            string senderName,
            string ladderId,
            string ladderName)
        {
            return await CreateNotificationAsync(
                recipientId,
                "ladder_invite",
                $"{senderName} invited you to join the ladder \"{ladderName}\"",
                ladderId);
        }

        /// <summary>
        /// Notifies a ladder organizer that someone has accepted their invitation
        /// </summary>
        public async Task<bool> SendLadderInvitationAcceptedNotification(
            string organizerId,
            string respondentName,
            string ladderId,
            string ladderName)
        {
            return await CreateNotificationAsync(
                organizerId,
                "ladder_invitation_accepted",
                $"{respondentName} has accepted your invitation to join \"{ladderName}\"",
                ladderId);
        }

        /// <summary>
        /// Notifies a ladder organizer that someone has declined their invitation
        /// </summary>
        public async Task<bool> SendLadderInvitationDeclinedNotification(
            string organizerId,
            string respondentName,
            string ladderId,
            string ladderName)
        {
            return await CreateNotificationAsync(
                organizerId,
                "ladder_invitation_rejected",
                $"{respondentName} has declined your invitation to join \"{ladderName}\"",
                ladderId);
        }

        /// <summary>
        /// Notifies a user that a ladder invitation has been cancelled
        /// </summary>
        public async Task<bool> SendLadderInvitationCancelledNotification(
            string recipientId,
            string organizerName,
            string ladderId,
            string ladderName)
        {
            return await CreateNotificationAsync(
                recipientId,
                "ladder_invitation_cancelled",
                $"{organizerName} has cancelled your invitation to \"{ladderName}\"",
                ladderId);
        }

        /// <summary>
        /// Notifies a ladder organizer when a player joins their ladder
        /// </summary>
        public async Task<bool> SendLadderPlayerJoinedNotification(
            string organizerId,
            string playerName,
            string ladderId,
            string ladderName)
        {
            return await CreateNotificationAsync(
                organizerId,
                "ladder_player_joined",
                $"{playerName} has joined your ladder \"{ladderName}\"",
                ladderId);
        }

        /// <summary>
        /// Notifies a user when their ladder position changes
        /// </summary>
        public async Task<bool> SendLadderPositionChangeNotification(
            string recipientId,
            string ladderId,
            string ladderName,
            int oldPosition,
            int newPosition)
        {
            string direction = newPosition < oldPosition ? "up" : "down";
            string changeMessage = newPosition < oldPosition
                ? $"moved up from {oldPosition} to {newPosition}"
                : $"moved down from {oldPosition} to {newPosition}";

            return await CreateNotificationAsync(
                recipientId,
                "ladder_position_change",
                $"Your position in the ladder \"{ladderName}\" has {changeMessage}",
                ladderId,
                null,
                new Dictionary<string, string> {
                    { "oldPosition", oldPosition.ToString() },
                    { "newPosition", newPosition.ToString() },
                    { "direction", direction }
                });
        }

        /// <summary>
        /// Notifies a user they have received a ladder challenge
        /// </summary>
        public async Task<bool> SendLadderChallengeNotification(
            string recipientId,
            string challengerName,
            string ladderId,
            string ladderName,
            string matchId)
        {
            return await CreateNotificationAsync(
                recipientId,
                "ladder_challenge",
                $"{challengerName} has challenged you to a match in the ladder \"{ladderName}\"",
                matchId,
                null,
                new Dictionary<string, string> { { "ladderId", ladderId } });
        }

        /// <summary>
        /// Notifies a user about the result of a ladder challenge
        /// </summary>
        public async Task<bool> SendLadderChallengeResultNotification(
            string recipientId,
            string opponentName,
            bool isWinner,
            string ladderId,
            string ladderName,
            string matchId,
            int? newPosition = null)
        {
            string message;
            var metadata = new Dictionary<string, string> {
                { "ladderId", ladderId },
                { "isWinner", isWinner.ToString() }
            };

            if (isWinner && newPosition.HasValue)
            {
                message = $"You won your challenge against {opponentName} in \"{ladderName}\" and moved to position {newPosition}";
                metadata.Add("newPosition", newPosition.ToString());
            }
            else if (isWinner)
            {
                message = $"You won your challenge against {opponentName} in the ladder \"{ladderName}\"";
            }
            else
            {
                message = $"You lost your challenge against {opponentName} in the ladder \"{ladderName}\"";
            }

            _logger.LogInformation("Sending ladder challenge result notification to {RecipientId} (Winner: {IsWinner})",
                recipientId, isWinner);

            return await CreateNotificationAsync(
                recipientId,
                "ladder_challenge_result",
                message,
                matchId,
                null,
                metadata);
        }

        #endregion

        #region Dispute Notifications

        /// <summary>
        /// Notifies a user when a match result is disputed
        /// </summary>
        public async Task<bool> SendMatchDisputeCreatedNotification(
            string recipientId,
            string disputerName,
            string competitionType,
            string competitionName,
            string matchId,
            string competitionId)
        {
            return await CreateNotificationAsync(
                recipientId,
                "match_dispute",
                $"{disputerName} has disputed a match result in the {competitionType} \"{competitionName}\"",
                matchId,
                null,
                new Dictionary<string, string> {
                    { "competitionType", competitionType },
                    { "competitionId", competitionId }
                });
        }

        /// <summary>
        /// Notifies a player that their opponent has submitted a match result
        /// </summary>
        public async Task<bool> SendTournamentMatchSubmissionNotification(
            string recipientId,
            string submitterName,
            string tournamentId,
            string tournamentName,
            string matchId)
        {
            return await CreateNotificationAsync(
                recipientId,
                "tournament_match_submission",
                $"{submitterName} has submitted a result for your match in \"{tournamentName}\". Please confirm or dispute the result.",
                matchId,
                null,
                new Dictionary<string, string> { { "tournamentId", tournamentId } });
        }

        /// <summary>
        /// Notifies tournament participants about completed matches
        /// </summary>
        public async Task<bool> SendTournamentMatchCompletedNotification(
            string recipientId,
            string winnerName,
            string loserName,
            string scoreDisplay,
            string tournamentId,
            string tournamentName,
            string matchId)
        {
            return await CreateNotificationAsync(
                recipientId,
                "tournament_match_completed",
                $"{winnerName} defeated {loserName} ({scoreDisplay}) in the tournament \"{tournamentName}\"",
                matchId,
                null,
                new Dictionary<string, string> { { "tournamentId", tournamentId } });
        }

        /// <summary>
        /// Notifies a user when a disputed match is resolved
        /// </summary>
        public async Task<bool> SendMatchDisputeResolvedNotification(
            string recipientId,
            string resolverName,
            string resolution,
            string competitionType,
            string competitionName,
            string matchId,
            string competitionId)
        {
            string resolutionText = resolution == "void_match" ? "voided" : "resolved";

            return await CreateNotificationAsync(
                recipientId,
                "match_dispute_resolved",
                $"{resolverName} has {resolutionText} a disputed match in the {competitionType} \"{competitionName}\"",
                matchId,
                null,
                new Dictionary<string, string> {
                    { "competitionType", competitionType },
                    { "competitionId", competitionId },
                    { "resolution", resolution }
                });
        }

        #endregion

        #region Deadline Notifications

        /// <summary>
        /// Notifies a user when a match deadline is approaching
        /// </summary>
        public async Task<bool> SendMatchDeadlineApproachingNotification(
            string recipientId,
            string competitionType,
            string competitionName,
            string matchId,
            string competitionId,
            string opponentName,
            int hoursRemaining)
        {
            return await CreateNotificationAsync(
                recipientId,
                "match_deadline_approaching",
                $"You have {hoursRemaining} hours left to play your match against {opponentName} in the {competitionType} \"{competitionName}\"",
                matchId,
                null,
                new Dictionary<string, string> {
                    { "competitionType", competitionType },
                    { "competitionId", competitionId },
                    { "hoursRemaining", hoursRemaining.ToString() }
                });
        }

        #endregion
    }
}