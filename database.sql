CREATE DATABASE IF NOT EXISTS college_event_management;
USE college_event_management;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100),
  register_number VARCHAR(30) UNIQUE,
  email VARCHAR(100) UNIQUE,
  department VARCHAR(20),
  year INT,
  phone VARCHAR(15),
  password VARCHAR(100),
  role VARCHAR(10) DEFAULT 'student'
);

CREATE TABLE events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_name VARCHAR(150),
  description TEXT,
  event_date DATE,
  event_time VARCHAR(20),
  venue VARCHAR(150),
  organizer VARCHAR(150),
  max_participants INT,
  registration_deadline DATE,
  status VARCHAR(20) DEFAULT 'Upcoming'
);

CREATE TABLE registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT,
  event_id INT,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'Registered',
  UNIQUE KEY unique_reg (student_id, event_id)
);

-- Admin (password: admin123)  -- plain text for simplicity
INSERT INTO users (name, email, password, role)
VALUES ('Admin', 'admin@college.com', 'admin123', 'admin');

-- Sample events
INSERT INTO events (event_name, description, event_date, event_time, venue, organizer, max_participants, registration_deadline) VALUES
('Technical Symposium', 'Annual technical event', '2026-10-15', '10:00 AM', 'Seminar Hall', 'CSE Department', 100, '2026-10-10'),
('Coding Contest', 'Programming competition', '2026-10-20', '2:00 PM', 'Computer Lab', 'CSE Association', 50, '2026-10-18'),
('Cultural Fest', 'Music and dance', '2026-10-25', '9:00 AM', 'Auditorium', 'Student Affairs', 200, '2026-10-22'),
('Sports Meet', 'Annual sports day', '2026-10-30', '8:00 AM', 'College Ground', 'PE Department', 150, '2026-10-28');