const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

// Replace with the actual executive WhatsApp number (without +)
const EXECUTIVE_WHATSAPP = process.env.EXECUTIVE_WHATSAPP || "919795555535";

const db = new Database(path.join(__dirname, "cafe.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    count INTEGER NOT NULL DEFAULT 0
  );

  INSERT OR IGNORE INTO page_views (id, count)
  VALUES (1, 0);

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_type TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    booking_date TEXT NOT NULL,
    booking_time TEXT NOT NULL,
    guests INTEGER NOT NULL,
    seating TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    experience TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function clean(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function validPhone(phone) {
  return /^[0-9+\-\s()]{7,20}$/.test(phone);
}

function validDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function validBookingType(type) {
  return ["table", "birthday", "kitty", "small-party"].includes(type);
}

// Page view counter
app.post("/api/views", (req, res) => {
  db.prepare(`
    UPDATE page_views
    SET count = count + 1
    WHERE id = 1
  `).run();

  const result = db.prepare(`
    SELECT count FROM page_views WHERE id = 1
  `).get();

  res.json({
    success: true,
    views: result.count
  });
});

app.get("/api/views", (req, res) => {
  const result = db.prepare(`
    SELECT count FROM page_views WHERE id = 1
  `).get();

  res.json({
    success: true,
    views: result.count
  });
});

// Save new booking
app.post("/api/bookings", (req, res) => {
  const bookingType = clean(req.body.bookingType);
  const name = clean(req.body.name);
  const phone = clean(req.body.phone);
  const email = clean(req.body.email);
  const date = clean(req.body.date);
  const time = clean(req.body.time);
  const guests = Number(req.body.guests);
  const seating = clean(req.body.seating);
  const message = clean(req.body.message);

  if (!validBookingType(bookingType)) {
    return res.status(400).json({
      success: false,
      message: "Please select a valid booking type."
    });
  }

  if (!name || !phone || !validPhone(phone)) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid name and phone number."
    });
  }

  if (!validDate(date) || !time) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid date and time."
    });
  }

  if (!Number.isInteger(guests) || guests < 1 || guests > 500) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid guest count."
    });
  }

  const result = db.prepare(`
    INSERT INTO bookings (
      booking_type,
      name,
      phone,
      email,
      booking_date,
      booking_time,
      guests,
      seating,
      message
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    bookingType,
    name,
    phone,
    email,
    date,
    time,
    guests,
    seating,
    message
  );

  const labels = {
    table: "Table Reservation",
    birthday: "Birthday Party",
    kitty: "Kitty Party",
    "small-party": "Small Party"
  };

  const whatsappMessage = [
    "New booking at 3 Idiots Garden Cafe",
    "",
    `Type: ${labels[bookingType]}`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Guests: ${guests}`,
    `Seating: ${seating || "Not specified"}`,
    `Email: ${email || "Not provided"}`,
    `Request: ${message || "None"}`,
    "",
    `Booking ID: ${result.lastInsertRowid}`
  ].join("\n");

  const whatsappUrl =
    `https://wa.me/${EXECUTIVE_WHATSAPP}?text=${encodeURIComponent(whatsappMessage)}`;

  res.status(201).json({
    success: true,
    bookingId: result.lastInsertRowid,
    message: "Your booking request has been received.",
    whatsappUrl
  });
});

// Reviews
app.get("/api/reviews", (req, res) => {
  const reviews = db.prepare(`
    SELECT id, name, rating, experience, created_at
    FROM reviews
    WHERE approved = 1
    ORDER BY created_at DESC
    LIMIT 30
  `).all();

  res.json({
    success: true,
    reviews
  });
});

app.post("/api/reviews", (req, res) => {
  const name = clean(req.body.name);
  const experience = clean(req.body.experience);
  const rating = Number(req.body.rating);

  if (!name || name.length < 2) {
    return res.status(400).json({
      success: false,
      message: "Please enter your name."
    });
  }

  if (!experience || experience.length < 10) {
    return res.status(400).json({
      success: false,
      message: "Please write at least 10 characters about your experience."
    });
  }

  if (![1, 2, 3, 4, 5].includes(rating)) {
    return res.status(400).json({
      success: false,
      message: "Please select a rating between 1 and 5 stars."
    });
  }

  const result = db.prepare(`
    INSERT INTO reviews (name, rating, experience)
    VALUES (?, ?, ?)
  `).run(name, rating, experience);

  res.status(201).json({
    success: true,
    reviewId: result.lastInsertRowid,
    message: "Thank you for sharing your experience!"
  });
});

// Admin bookings list
app.get("/api/admin/bookings", (req, res) => {
  const bookings = db.prepare(`
    SELECT *
    FROM bookings
    ORDER BY created_at DESC
  `).all();

  res.json({
    success: true,
    bookings
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`3 Idiots Garden Cafe is running on http://localhost:${PORT}`);
});