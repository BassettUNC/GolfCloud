const admin = require("firebase-admin");

/**
 * Sends notifications to users based on the provided activity data.
 *
 * @param {object} activityData
 *      - The activity data containing information about the activity.
 * @return {Promise<object>}
 *      - A promise that resolves when notifications are sent.
 */
function sendFromAdmin(activityData) {
  // Fetch all user tokens from Firestore
  const usersRef = admin.firestore().collection("users");
  let badgeCount = 0;
  return usersRef.where("userType", "in", activityData.assignedGroups).get()
      .then((snapshot) => {
        const tokens = [];
        snapshot.forEach((doc) => {
          const token = doc.data().fcm_token;
          const name = doc.data().name;
          badgeCount = doc.data().badgeCount;
          if (token) {
            tokens.push(token);
            console.log(`Sending notification to user : ${name}`);
          }
        });

        sendNotification(tokens, activityData.title, activityData.description, badgeCount);
      })
      .catch((error) => {
        console.error("Error fetching user tokens:", error);
        throw error;
      });
}

const sendNotification = async (tokens, title, body, badgeCount) => {
  // Create Multicast message with notification payload
  const message = {
    notification: {
      title: title || "Error",
      body: body || "ERROR: Something seems broken :(",
    },
    apns: {
      payload: {
        aps: {
          sound: "default", // Sound settings for iOS
          badge: (badgeCount + 1).toString(),
        },
      },
    },
    tokens: tokens,
  };

  // Send multicast message
  return admin.messaging().sendEachForMulticast(message);
};

module.exports = {
  sendFromAdmin: sendFromAdmin,
  sendNotification: sendNotification,
};
