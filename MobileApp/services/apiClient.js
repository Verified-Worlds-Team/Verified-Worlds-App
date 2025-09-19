const axios = require('axios');

// Set the base URL for the API. Replace this with your actual API endpoint.
// For example: 'https://api.yourgameapp.com/v1'
const API_BASE_URL = 'https://api.examplegameverifier.com';

// Create a new Axios instance with a custom configuration.
// This is useful for setting a base URL, headers, and other defaults.
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        // You can add other headers here, such as for authentication (e.g., 'Authorization')
    },
});

/**
 * Handles API errors by logging them and re-throwing a generic error.
 * @param {Error} error - The Axios error object.
 */
const handleApiError = (error) => {
    if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('API Response Error:', error.response.data);
        console.error('Status:', error.response.status);
        console.error('Headers:', error.response.headers);
    } else if (error.request) {
        // The request was made but no response was received
        console.error('API Request Error:', error.request);
    } else {
        // Something happened in setting up the request that triggered an Error
        console.error('Error:', error.message);
    }
    // You might want to re-throw a more user-friendly error
    throw new Error('An unexpected error occurred while communicating with the API.');
};

/**
 * An example API client service.
 * Contains methods for common API interactions.
 */
const gameApiClient = {
    /**
     * Fetches a list of all games from the API.
     * @returns {Promise<Array>} A promise that resolves with an array of games.
     */
    async getGames() {
        try {
            const response = await apiClient.get('/games');
            return response.data;
        } catch (error) {
            handleApiError(error);
        }
    },

    /**
     * Fetches details for a specific game by its ID.
     * @param {string} gameId - The ID of the game to fetch.
     * @returns {Promise<Object>} A promise that resolves with the game details.
     */
    async getGameDetails(gameId) {
        try {
            const response = await apiClient.get(`/games/${gameId}`);
            return response.data;
        } catch (error) {
            handleApiError(error);
        }
    },

    /**
     * Submits a new score for a user to the API.
     * @param {Object} scoreData - An object containing the score details.
     * @returns {Promise<Object>} A promise that resolves with the API response.
     */
    async submitScore(scoreData) {
        try {
            const response = await apiClient.post('/scores', scoreData);
            return response.data;
        } catch (error) {
            handleApiError(error);
        }
    },

    /**
     * Updates a user's game progress.
     * @param {string} userId - The ID of the user.
     * @param {Object} progressData - An object containing the progress details.
     * @returns {Promise<Object>} A promise that resolves with the updated progress.
     */
    async updateProgress(userId, progressData) {
        try {
            const response = await apiClient.put(`/users/${userId}/progress`, progressData);
            return response.data;
        } catch (error) {
            handleApiError(error);
        }
    },
};

module.exports = gameApiClient;
