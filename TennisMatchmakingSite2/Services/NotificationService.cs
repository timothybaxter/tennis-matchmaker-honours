using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;

namespace TennisMatchmakingSite2.Services
{
	public class NotificationService
	{
		private readonly HttpClient _httpClient;
		private readonly ILogger<NotificationService> _logger;
		private readonly IHttpContextAccessor _httpContextAccessor;

		public NotificationService(
			IConfiguration configuration,
			ILogger<NotificationService> logger,
			IHttpContextAccessor httpContextAccessor)
		{
			_logger = logger;
			_httpContextAccessor = httpContextAccessor;
			_httpClient = new HttpClient
			{
				BaseAddress = new Uri(configuration["ApiBaseUrl"] ?? throw new InvalidOperationException("ApiBaseUrl not configured"))
			};
		}

		/// <summary>
		/// Creates a notification for a user
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
				var token = _httpContextAccessor.HttpContext?.Session.GetString("JWTToken");
				if (string.IsNullOrEmpty(token))
				{
					_logger.LogWarning("No JWT token available for creating notification");
					return false;
				}

				// If sourceUserId not provided, use current user ID
				if (string.IsNullOrEmpty(sourceUserId))
				{
					sourceUserId = _httpContextAccessor.HttpContext?.Session.GetString("UserId");
				}

				var request = new HttpRequestMessage(HttpMethod.Post, "notifications");
				request.Headers.Add("Authorization", "Bearer " + token);

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

				request.Content = JsonContent.Create(notification);
				var response = await _httpClient.SendAsync(request);

				if (response.IsSuccessStatusCode)
				{
					_logger.LogInformation("Notification created successfully");
					return true;
				}
				else
				{
					var responseContent = await response.Content.ReadAsStringAsync();
					_logger.LogError("Failed to create notification: {Response}", responseContent);
					return false;
				}
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Error creating notification");
				return false;
			}
		}



		public async Task<bool> SendMatchInviteNotification(string recipientId, string senderName, string matchId)
		{
			return await CreateNotificationAsync(
				recipientId,
				"match_invite",
				$"{senderName} invited you to a match",
				matchId);
		}

		public async Task<bool> SendMessageNotification(string recipientId, string senderName, string conversationId)
		{
			return await CreateNotificationAsync(
				recipientId,
				"message",
				$"{senderName} sent you a message",
				conversationId);
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
			string location = string.IsNullOrEmpty(matchLocation) ? "a match" : $"the match at {matchLocation}";

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
			string location = string.IsNullOrEmpty(matchLocation) ? "your match" : $"your match at {matchLocation}";

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
			string location = string.IsNullOrEmpty(matchLocation) ? "your match" : $"your match at {matchLocation}";

			return await CreateNotificationAsync(
				hostId,
				"match_request",
				$"{requesterName} has requested to join {location}",
				matchId);
		}
		// Tournament invitation notifications
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

		// Tournament start notifications
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

		// Tournament match scheduled notification
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

		// Tournament match result notification
		public async Task<bool> SendTournamentMatchResultNotification(
			string recipientId,
			string opponentName,
			bool isWinner,
			string tournamentId,
			string tournamentName,
			string matchId)
		{
			string message = isWinner ?
				$"You won your match against {opponentName} in \"{tournamentName}\"" :
				$"Your match against {opponentName} in \"{tournamentName}\" has ended";

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

		// Tournament completed notification
		public async Task<bool> SendTournamentCompletedNotification(
			string recipientId,
			string tournamentId,
			string tournamentName,
			string winnerName,
			bool isWinner)
		{
			string message = isWinner ?
				$"Congratulations! You won the tournament \"{tournamentName}\"" :
				$"The tournament \"{tournamentName}\" has ended. {winnerName} is the winner";

			return await CreateNotificationAsync(
				recipientId,
				"tournament_completed",
				message,
				tournamentId,
				null,
				new Dictionary<string, string> { { "isWinner", isWinner.ToString() } });
		}

		// Ladder notifications
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

		// Ladder position change notification
		public async Task<bool> SendLadderPositionChangeNotification(
			string recipientId,
			string ladderId,
			string ladderName,
			int oldPosition,
			int newPosition)
		{
			string direction = newPosition < oldPosition ? "up" : "down";

			return await CreateNotificationAsync(
				recipientId,
				"ladder_position_change",
				$"Your position in the ladder \"{ladderName}\" has changed from {oldPosition} to {newPosition}",
				ladderId,
				null,
				new Dictionary<string, string> {
			{ "oldPosition", oldPosition.ToString() },
			{ "newPosition", newPosition.ToString() },
			{ "direction", direction }
				});
		}

		// Challenge received notification
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

		// Challenge result notification
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

			return await CreateNotificationAsync(
				recipientId,
				"ladder_challenge_result",
				message,
				matchId,
				null,
				metadata);
		}

		// Match dispute notifications
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

		// Deadline approaching notifications
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

		

	}
}