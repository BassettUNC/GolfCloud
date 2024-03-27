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
  const batch = admin.firestore().batch();
  return usersRef.where("userType", "in", activityData.assignedGroups).get()
      .then(async (snapshot) => { // Use async to allow awaiting sendNotification
        const tokens = [];
        snapshot.forEach((doc) => {
          const token = doc.data().fcm_token;
          if (token) {
            tokens.push(token);

            // Increase the badgeCount field for each user
            const userRef = usersRef.doc(doc.id);
            batch.update(userRef, {badgeCount: admin.firestore.FieldValue.increment(1)});
          }
        });

        // Commit the batch update
        await batch.commit();

        // Await sendNotification to finish before resolving the promise
        await sendNotification(tokens, activityData.title, activityData.description);
      })
      .catch((error) => {
        console.error("Error fetching user tokens:", error);
        throw error;
      });
}

const sendNotification = async (tokens, title, body) => {
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
        },
      },
    },
    tokens: tokens,
  };
  // Send multicast message
  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    response.responses.forEach((resp, index) => {
      if (!resp.success) {
        console.error(`Error sending message to token ${tokens[index]}:`, resp.error);
      }
    });
    return response;
  } catch (error) {
    console.error("Error sending multicast message:", error);
    throw error; // Rethrow the error to propagate it further if necessary
  }
};

module.exports = {
  sendFromAdmin: sendFromAdmin,
  sendNotification: sendNotification,
};
