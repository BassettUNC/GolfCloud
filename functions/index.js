const functions = require("firebase-functions");
const admin = require("firebase-admin");
const notificationHelpers = require("./helpers");

// Initialize Firebase Admin SDK
admin.initializeApp();

// Firestore document listener
exports.sendNotificationOnActivityCreation =
    functions.firestore.document("activity/{activityId}")
        .onCreate((snapshot, context) => {
          // Get the new activity data
          const activityData = snapshot.data();

          if (activityData.category === "fromAdmin") {
            return notificationHelpers.sendFromAdmin(activityData);
          } else {
            return null;
          }
        });

exports.sendNotificationOnPerformanceRecordCreation = functions.firestore
    .document("performanceRecords/{recordId}")
    .onCreate(async (snapshot, context) => {
      const newRecordData = snapshot.data();

      const did = newRecordData.did;
      const score = newRecordData.score;
      const uid = newRecordData.uid;

      // Query performanceRecords collection to count records with the same did
      const recordsSnapshot = await admin
          .firestore()
          .collection("performanceRecords")
          .where("did", "==", did)
          .get();

      const notificationTitles = [
        "New First Place Achieved! 🏆 ",
        "Champion Alert 🥇",
        "Top Spot Taken 🎉",
        "Leading the Pack 🚀",
        "Gold Standard Reached 🏅",
        "Rising to the Top ⭐️",
        "Breaking Records 💥",
        "Shining Bright 🌟",
        "Surging Ahead 🥇",
        "First Place Update 🔥",
      ];

      // Check if there are at least three other performanceRecords with the same did
      if (recordsSnapshot.size > 3) {
        // Check if the new performanceRecord has the highest score
        const lowestScoreSnapshot = await admin
            .firestore()
            .collection("performanceRecords")
            .where("did", "==", did)
            .orderBy("score", "asc")
            .limit(2)
            .get();

        if (!lowestScoreSnapshot.empty) {
          const lowestScore = lowestScoreSnapshot.docs[0].data().score;
          const secondLowestScore = lowestScoreSnapshot.docs[1].data().score;
          if (score <= lowestScore && secondLowestScore > score) {
            const thisUser = await admin
                .firestore()
                .collection("users")
                .where("id", "==", uid)
                .get();

            const thisDrill = await admin
                .firestore()
                .collection("drills")
                .where("id", "==", did)
                .get();

            // Fetch tokens of all users
            const usersRef = admin.firestore().collection("users");
            const userSnapshot = await usersRef.get();
            const tokens = [];
            const batch = admin.firestore().batch();
            userSnapshot.forEach((doc) => {
              const token = doc.data().fcm_token;
              if (token) {
                tokens.push(token);
              }
              const userRef = usersRef.doc(doc.id);
              batch.update(userRef, {badgeCount: admin.firestore.FieldValue.increment(1)});
            });

            // Commit the batch update
            await batch.commit();

            // Send notification if tokens are available
            if (tokens.length > 0) {
              try {
                const notifBody = thisUser.docs[0].data().name +
                " has the new highest score on " + thisDrill.docs[0].data().name;
                const notifTitle = notificationTitles[Math.floor(Math.random() * notificationTitles.length)];
                await notificationHelpers.sendNotification(tokens, notifTitle,
                    notifBody, thisUser.docs[0].data().badgeCount);

                // Create record in the activity collection
                // Get current date in EST
                const currentDate = new Date();
                const estOffset = -5 * 60; // EST is 5 hours behind UTC
                const estDate = new Date(currentDate.getTime() + estOffset * 60 * 1000);

                // Format EST date as YYYY-MM-DD
                const formattedDate = estDate.toISOString().split("T")[0];

                await admin.firestore().collection("activity").add({
                  assignedGroups: [],
                  assignedUsers: [],
                  category: "leaderboard",
                  date: formattedDate,
                  description: `${notifBody}`,
                  id: admin.firestore().collection("activity").doc().id,
                  title: `${notifTitle}`,
                });
              } catch (error) {
                console.error("Error sending notification:", error);
                throw error;
              }
            } else {
              console.log("No tokens found to send notification");
            }
          }
        }
      }
    });

exports.updateNotifBadge = functions.firestore.document("/users/{userId}")
    .onUpdate((change, context) => {
      const beforeData = change.before.data();
      const afterData = change.after.data();

      // Check if badgeCount field has changed
      if (beforeData.badgeCount !== afterData.badgeCount) {
        const userId = context.params.userId;
        const badgeCount = afterData.badgeCount;

        // Fetch user's device token from Firestore
        return admin.firestore().doc(`/users/${userId}`).get()
            .then((docSnapshot) => {
              const tokens = [];
              const deviceToken = docSnapshot.data().fcm_token;
              tokens.push(deviceToken);
              // Update badge count on the device
              // const message = {
              //   data: {
              //     badge: badgeCount.toString(),
              //   },
              //   token: deviceToken,
              // };

              const message = {
                apns: {
                  payload: {
                    aps: {
                      badge: badgeCount, // Sound settings for iOS
                    },
                  },
                },
                tokens: tokens,
              };

              return admin.messaging().sendEachForMulticast(message);
            })
            .catch((error) => {
              console.error("Error fetching device token:", error);
            });
      } else {
        return null; // Exit the function without performing any further action
      }
    });
