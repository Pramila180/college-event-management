const express = require('express');
const session = require('express-session');
const mysql = require('mysql2');
const path = require('path');

const app = express();

// Database
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'college_event_management'
}).promise();

// Setup
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: 'college_secret',
  resave: false,
  saveUninitialized: false
}));

// Make user + messages available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.msg = req.session.msg || null;
  req.session.msg = null;
  next();
});

// ==================== HOME ====================
app.get('/', async (req, res) => {
  const [events] = await db.query(
    "SELECT * FROM events WHERE status='Upcoming' ORDER BY event_date LIMIT 4"
  );
  res.render('index', { events });
});

// ==================== REGISTER ====================
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
  const { name, register_number, email, department, year, phone, password, confirm } = req.body;

  if (!name || !register_number || !email || !password) {
    req.session.msg = 'Please fill all required fields.';
    return res.redirect('/register');
  }
  if (password !== confirm) {
    req.session.msg = 'Passwords do not match.';
    return res.redirect('/register');
  }

  const [check] = await db.query(
    'SELECT id FROM users WHERE email=? OR register_number=?',
    [email, register_number]
  );
  if (check.length) {
    req.session.msg = 'Email or Register Number already exists.';
    return res.redirect('/register');
  }

  await db.query(
    'INSERT INTO users (name, register_number, email, department, year, phone, password) VALUES (?,?,?,?,?,?,?)',
    [name, register_number, email, department, year, phone, password]
  );

  req.session.msg = 'Registration successful. Please login.';
  res.redirect('/login');
});

// ==================== LOGIN ====================
app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.query('SELECT * FROM users WHERE email=? AND password=?', [email, password]);

  if (!rows.length) {
    req.session.msg = 'Invalid email or password.';
    return res.redirect('/login');
  }

  const user = rows[0];
  req.session.user = { id: user.id, name: user.name, role: user.role };

  if (user.role === 'admin') return res.redirect('/dashboard');
  req.session.msg = 'Welcome, ' + user.name;
  res.redirect('/events');
});

// ==================== LOGOUT ====================
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ==================== EVENTS LIST ====================
app.get('/events', async (req, res) => {
  const [events] = await db.query("SELECT * FROM events WHERE status='Upcoming' ORDER BY event_date");

  for (let e of events) {
    const [c] = await db.query(
      "SELECT COUNT(*) AS cnt FROM registrations WHERE event_id=? AND status='Registered'",
      [e.id]
    );
    e.available = e.max_participants - c[0].cnt;
  }
  res.render('events', { events });
});

// ==================== EVENT DETAILS ====================
app.get('/events/:id', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM events WHERE id=?', [req.params.id]);
  if (!rows.length) return res.send('Event not found');

  const event = rows[0];

  const [c] = await db.query(
    "SELECT COUNT(*) AS cnt FROM registrations WHERE event_id=? AND status='Registered'",
    [event.id]
  );
  event.available = event.max_participants - c[0].cnt;

  let already = false;
  if (req.session.user && req.session.user.role === 'student') {
    const [r] = await db.query(
      "SELECT id FROM registrations WHERE student_id=? AND event_id=? AND status='Registered'",
      [req.session.user.id, event.id]
    );
    already = r.length > 0;
  }

  res.render('event-details', { event, already });
});

// ==================== REGISTER FOR EVENT ====================
app.post('/events/:id/register', async (req, res) => {
  if (!req.session.user) {
    req.session.msg = 'Please login to continue.';
    return res.redirect('/login');
  }

  const studentId = req.session.user.id;
  const eventId = req.params.id;

  const [er] = await db.query('SELECT * FROM events WHERE id=?', [eventId]);
  const event = er[0];

  if (event.status !== 'Upcoming') {
    req.session.msg = 'Registration closed.';
    return res.redirect('/events/' + eventId);
  }

  const [ex] = await db.query(
    "SELECT id FROM registrations WHERE student_id=? AND event_id=? AND status='Registered'",
    [studentId, eventId]
  );
  if (ex.length) {
    req.session.msg = 'You are already registered for this event.';
    return res.redirect('/events/' + eventId);
  }

  const [c] = await db.query(
    "SELECT COUNT(*) AS cnt FROM registrations WHERE event_id=? AND status='Registered'",
    [eventId]
  );
  if (c[0].cnt >= event.max_participants) {
    req.session.msg = 'Registration is full.';
    return res.redirect('/events/' + eventId);
  }

  // Insert or reactivate
  const [old] = await db.query(
    'SELECT id FROM registrations WHERE student_id=? AND event_id=?',
    [studentId, eventId]
  );

  if (old.length) {
    await db.query("UPDATE registrations SET status='Registered' WHERE id=?", [old[0].id]);
  } else {
    await db.query('INSERT INTO registrations (student_id, event_id) VALUES (?,?)', [studentId, eventId]);
  }

  req.session.msg = 'Successfully registered for the event.';
  res.redirect('/my-events');
});

// ==================== MY EVENTS ====================
app.get('/my-events', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const [rows] = await db.query(
    `SELECT r.id AS reg_id, r.registered_at, r.status, e.event_name, e.event_date, e.venue
     FROM registrations r
     JOIN events e ON e.id = r.event_id
     WHERE r.student_id = ?
     ORDER BY r.registered_at DESC`,
    [req.session.user.id]
  );
  res.render('my-events', { registrations: rows });
});

app.post('/my-events/:id/cancel', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  await db.query(
    "UPDATE registrations SET status='Cancelled' WHERE id=? AND student_id=?",
    [req.params.id, req.session.user.id]
  );
  req.session.msg = 'Registration cancelled.';
  res.redirect('/my-events');
});

// ==================== ADMIN DASHBOARD ====================
app.get('/dashboard', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.send('Access denied. Admins only.');
  }

  const [[{ totalEvents }]] = await db.query('SELECT COUNT(*) AS totalEvents FROM events');
  const [[{ totalStudents }]] = await db.query("SELECT COUNT(*) AS totalStudents FROM users WHERE role='student'");
  const [[{ totalRegs }]] = await db.query("SELECT COUNT(*) AS totalRegs FROM registrations WHERE status='Registered'");

  res.render('dashboard', { totalEvents, totalStudents, totalRegs });
});

// ==================== ADMIN MANAGE EVENTS ====================
app.get('/admin-events', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.send('Access denied');
  const [events] = await db.query('SELECT * FROM events ORDER BY id DESC');
  res.render('admin-events', { events });
});

// Add event
app.get('/add-event', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.send('Access denied');
  res.render('add-event');
});

app.post('/add-event', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.send('Access denied');

  const { event_name, description, event_date, event_time, venue, organizer, max_participants, registration_deadline, status } = req.body;

  if (!event_name || !event_date || !venue || !max_participants) {
    req.session.msg = 'Please fill required fields.';
    return res.redirect('/add-event');
  }

  await db.query(
    `INSERT INTO events (event_name, description, event_date, event_time, venue, organizer, max_participants, registration_deadline, status)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [event_name, description, event_date, event_time, venue, organizer, max_participants, registration_deadline, status]
  );

  req.session.msg = 'Event added successfully.';
  res.redirect('/admin-events');
});

// Edit event
app.get('/edit-event/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.send('Access denied');
  const [rows] = await db.query('SELECT * FROM events WHERE id=?', [req.params.id]);
  res.render('edit-event', { event: rows[0] });
});

app.post('/edit-event/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.send('Access denied');

  const { event_name, description, event_date, event_time, venue, organizer, max_participants, registration_deadline, status } = req.body;

  await db.query(
    `UPDATE events SET event_name=?, description=?, event_date=?, event_time=?, venue=?, organizer=?, max_participants=?, registration_deadline=?, status=?
     WHERE id=?`,
    [event_name, description, event_date, event_time, venue, organizer, max_participants, registration_deadline, status, req.params.id]
  );

  req.session.msg = 'Event updated successfully.';
  res.redirect('/admin-events');
});

// Delete event
app.post('/delete-event/:id', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.send('Access denied');

  await db.query('DELETE FROM registrations WHERE event_id=?', [req.params.id]);
  await db.query('DELETE FROM events WHERE id=?', [req.params.id]);

  req.session.msg = 'Event deleted successfully.';
  res.redirect('/admin-events');
});

// View registrations
app.get('/registrations', async (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.send('Access denied');

  const [regs] = await db.query(
    `SELECT r.id, u.name AS student, u.register_number, e.event_name, r.registered_at, r.status
     FROM registrations r
     JOIN users u ON u.id = r.student_id
     JOIN events e ON e.id = r.event_id
     ORDER BY r.registered_at DESC`
  );
  res.render('registrations', { regs });
});

// Start
app.listen(3000, () => console.log('Server running on http://localhost:3000'));