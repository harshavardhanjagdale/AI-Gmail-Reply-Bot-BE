-- Email Reply Bot Database Schema
-- Run this script to create the database and tables

CREATE DATABASE IF NOT EXISTS email_reply_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE email_reply_bot;

-- Users table: Stores OAuth tokens (encrypted)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(21) PRIMARY KEY,
  access_token TEXT NOT NULL, -- Encrypted
  refresh_token TEXT, -- Encrypted
  token_type VARCHAR(50) DEFAULT 'Bearer',
  scope TEXT,
  id_token TEXT, -- Encrypted
  expiry_date BIGINT,
  refresh_token_expires_in INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at),
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Emails table: Stores email classification data
CREATE TABLE IF NOT EXISTS emails (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(21) NOT NULL,
  subject VARCHAR(500),
  snippet TEXT,
  ai_resp TEXT,
  category VARCHAR(100),
  action TEXT,
  justification TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at),
  INDEX idx_category (category),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

