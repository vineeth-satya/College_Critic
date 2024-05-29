const express = require('express');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
var passwordHash = require('password-hash');
const path = require('path');
const fileUpload = require("express-fileupload");
const { Storage } = require("@google-cloud/storage");

const app = express();
const port = process.env.PORT || 3000;

const serviceAccount = require('./key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://console.firebase.google.com/u/0/project/college-critic/firestore/data/~2F",
  storageBucket: 'https://console.firebase.google.com/u/0/project/college-critic/storage/college-critic.appspot.com/files',
});

const storage = new Storage({
  projectId: "college-critic",
  keyFilename: "./key.json",
})

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); 

const bucket = storage.bucket("gs://college-critic.appspot.com");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(fileUpload());

app.use('/css', (req, res, next) => {
  res.type('text/css');
  next();
}, express.static(path.join(__dirname, './css')));

app.use('/js', (req, res, next) => {
    res.type('text/js');
    next();
  }, express.static(path.join(__dirname, './js')));

app.use('/public', express.static(path.join(__dirname, './public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/index.html'));
  console.log("started");
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, "Admin_Register/index.html"));
});

app.get('/login', (req, res) =>{
    res.sendFile(path.join(__dirname, "Admin_Register/index.html"));
});

app.get('/studentregister', (req, res) => {
  res.sendFile(path.join(__dirname, "student_register/index.html"));
});

app.get('/studentlogin', (req, res) => {
  res.sendFile(path.join(__dirname, "student_register/index.html"));
});

app.get('/admindashboard', (req, res) => {
  res.sendFile(path.join(__dirname, "Admin_Dashboard/dashboard.html"));
});

app.get('/facilities', (req, res) => {
  res.sendFile(path.join(__dirname, "Admin_Dashboard/facilitiesreview.html"));
});

app.get('/reviews', (req, res) => {
  res.render(__dirname + "/views/reviews.ejs", { reviews : "" });
});

app.get('/studentreview', (req, res) => {
  res.render(__dirname + "/views/" + "index.ejs", { studentEmail : "", collegeName : "" })
});

app.get('/college-details', (req, res) => {
  res.render(__dirname + "/views/show.ejs", { collegeData: "", reviews: "", imageUrls: [] });
});

app.post('/register', async (req, res) => {
    try {
      const { email, password, AdminName, InstituteName, domain } = req.body;
      const hashedPassword = passwordHash.generate(password);
      const userRecord = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: 'Admin'
      });
      const adminData = {
        email: email,
        AdminName: AdminName,
        InstituteName: InstituteName.toLowerCase(),
        domain: domain,
        password: hashedPassword
      };
  
      await admin.firestore().collection('admins').doc(userRecord.uid).set(adminData);
  
      console.log('Successfully created new user:', userRecord.uid);
      res.redirect(`/login`)
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).send('Error creating user');
    }
});

app.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      const adminQuery = await admin.firestore().collection('admins').where('email', '==', email).get();
      if (adminQuery.empty) {
        res.status(401).send('Unauthorized');
        return;
      }
  
      const adminData = adminQuery.docs[0].data();
  
      if (passwordHash.verify(password, adminData.password)) {
        res.redirect(`/admindashboard?collegeName=${adminData.InstituteName}`);
      } else {
        res.status(401).send('Unauthorized');
      }
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).send('Login failed');
    }
});  

app.post('/studentregister', async (req, res) => {
  try {
    const { email, password, StudentName, InstituteName } = req.body;
    const hashedPassword = passwordHash.generate(password);
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: 'Student'
    });

    const studentUID = userRecord.uid;
    const adminQuery = await admin.firestore().collection('admins').where('InstituteName', '==', InstituteName.toLowerCase()).get();

    if (adminQuery.empty) {
      res.status(404).send('Institute not found');
      return;
    }

    const adminData = adminQuery.docs[0].data();
    const instituteDomain = adminData.domain;

    if (email.endsWith(`@${instituteDomain}`)) {
      const studentData = {
        uid: studentUID,
        email: email,
        StudentName: StudentName,
        InstituteName: InstituteName.toLowerCase(),
        password: hashedPassword
      };

      const collegeName = adminData.InstituteName;
      const collegeStudentsRef = admin.firestore().collection('colleges').doc(collegeName.toLowerCase()).collection('students');
      await collegeStudentsRef.doc(userRecord.uid).set(studentData);
      console.log('Successfully created new student:', userRecord.uid);
      res.redirect('/studentlogin');
    } else {
      res.status(400).send('Student email domain does not match the expected domain for the institute.');
    }
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(500).send('Error creating student');
  }
});

app.post('/studentlogin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const studentEmail = email;
    const collegeName = req.body.InstituteName;

    const studentQuery = await admin.firestore().collection('colleges').doc(collegeName.toLowerCase()).collection('students').where('email', '==', email).get();

    if (studentQuery.empty) {
      res.status(401).send('Unauthorized');
      return;
    }

    const studentData = studentQuery.docs[0].data();

    if (passwordHash.verify(password, studentData.password)) {
      res.render("index.ejs", { studentEmail : studentEmail, collegeName : collegeName });
    } else {
      res.status(401).send('Unauthorized');
    }
  } catch (error) {
    console.error('Error during student login:', error);
    res.status(500).send('Login failed');
  }
});

app.post('/submit-facilities', async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).send('No file was uploaded.');
    }

    const facilitiesData = req.body;
    const collegeName = facilitiesData.collegeName;
    const collegeRef = admin.firestore().collection('colleges').doc(collegeName.toLowerCase());
    const facilitiesRef = collegeRef.collection('facilities');

    let facilitiesDocRef;

    const querySnapshot = await facilitiesRef.get();

    if (querySnapshot.empty) {
      facilitiesDocRef = facilitiesRef.doc();
      facilitiesData.facilitiesId = facilitiesDocRef.id;
      facilitiesData.imageUrls = [];
      await facilitiesDocRef.set(facilitiesData);
    } else {
      const facilitiesDoc = querySnapshot.docs[0];
      facilitiesDocRef = facilitiesDoc.ref;
      facilitiesData.facilitiesId = facilitiesDoc.id;
      facilitiesData.imageUrls = facilitiesDoc.data().imageUrls || [];
      await facilitiesDocRef.set(facilitiesData, { merge: true });
    }

    const image = req.files.image;
    const originalname = image.name;
    const file = storage
      .bucket('college-critic.appspot.com')
      .file(`facilities/${collegeName.toLowerCase()}/${facilitiesData.facilitiesId}/${originalname}`);

    const stream = file.createWriteStream({
      metadata: {
        contentType: image.mimetype,
      },
    });

    stream.on('error', (err) => {
      console.error('Error uploading image:', err);
    });

    stream.on('finish', async () => {
      console.log('Image uploaded successfully.');

      const imageUrl = await file.getSignedUrl({
        action: 'read',
        expires: '03-17-2025',
      }).then((urls) => {
        return urls[0];
      }).catch((error) => {
        console.error('Error getting signed URL:', error);
        return null;
      });

      if (imageUrl) {
        facilitiesData.imageUrls.push(imageUrl);

        await facilitiesDocRef.update({ imageUrls: facilitiesData.imageUrls })
          .then(() => {
            console.log('Image URL updated in Firestore');
          })
          .catch((error) => {
            console.error('Error updating image URL in Firestore:', error);
          });
      }
    });

    stream.end(image.data);
    res.redirect(302, '/facilities');
  } catch (error) {
    console.error('Error submitting facilities:', error);
    res.status(500).send('Error submitting facilities');
  }
});

app.post('/reviewsSubmit', async (req, res) => {
  console.log('Executing /reviews route');
  try {
    const collegeName = req.body.collegeName;
    const reviewsQuery = await admin.firestore().collection('colleges').doc(collegeName.toLowerCase()).collection('students').get();
    const reviewsData = [];
    reviewsQuery.forEach((doc) => {
      const reviewData = doc.data().review;
      const student = doc.data().StudentName;
      reviewsData.push({ student, reviewData });
    });

    res.render('reviews.ejs', { reviews: reviewsData });
  } catch (error) {
    console.error('Error getting college details:', error);
    res.status(500).send('Error getting college details');
  }
});

app.post('/studentreview', async (req, res) => {
  try {
    const { review, email, college } = req.body;

    const studentQuery = await admin.firestore().collection('colleges').doc(college.toLowerCase()).collection('students').where('email', '==', email).get();

    if (studentQuery.empty) {
      res.status(404).send('Student not found');
      return;
    }

    const studentData = studentQuery.docs[0].data();

    const studentRef = admin.firestore().collection('colleges').doc(college.toLowerCase()).collection('students').doc(studentData.uid);

    const reviewData = {
      review: review,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    await studentRef.set(reviewData, { merge: true });

    console.log('Review submitted successfully');
    res.redirect(302, '/studentreview');
  } catch (error) {
    console.error('Error submitting student review:', error);
    res.status(500).send('Error submitting review');
  }
});

app.post('/college-details', async (req, res) => {
  try {
    const collegeName = req.body.collegeName;
    const collegeDoc = await admin.firestore().collection('colleges').doc(collegeName.toLowerCase()).get();

    const facilitiesQuery = await collegeDoc.ref.collection('facilities').get();

    const facilities = [];

    facilitiesQuery.forEach((facilityDoc) => {
      facilities.push(facilityDoc.data());
    });

    const facility = facilities[0];

    // Retrieve the image URL from the first facility entry
    const imageUrls = facility.imageUrls[0];

    console.log(imageUrls);
    const reviewsQuery = await admin.firestore().collection('colleges').doc(collegeName.toLowerCase()).collection('students').get();

    const reviews = [];
    reviewsQuery.forEach((doc) => {
      const reviewData = doc.data().review;
      const student = doc.data().StudentName;
      reviews.push({ student, reviewData });
    });

    res.render('show.ejs', { collegeData: facilities, imageUrls, reviews });
  } catch (error) {
    console.error('Error getting college details:', error);
    res.status(500).send('Error getting college details');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
