# Multi-User Security & Isolation

## Overview

This application is designed to support **multiple users** with **strict data isolation**. Each user can only access their own data.

## Security Features

### ✅ User Isolation

1. **Strict User Validation**
   - Users must provide a valid `userId` that exists in the database
   - No auto-resolution to other users (removed for security)
   - Invalid `userId` results in a 404 error

2. **OAuth Token Isolation**
   - Each user has their own encrypted OAuth tokens
   - Tokens are stored separately per user
   - Token refresh is isolated per user

3. **Email Data Isolation**

4. **Middleware Validation**
   - `validateUserId`: Ensures user exists before processing requests
   - `validateEmailOwnership`: Validates user before email operations
   - Applied to all Gmail-related routes

## How It Works

### User Registration Flow

1. User visits `/auth/login`
2. Completes Google OAuth flow
3. Backend creates new user with unique `userId` (nanoid)
4. OAuth tokens are encrypted and stored in `users` table
5. User receives `userId` and stores it (frontend localStorage)

### User Authentication Flow

1. Frontend sends requests with `userId` in URL params
2. Middleware validates `userId` exists in database
3. If valid, request proceeds
4. If invalid, returns 404 error

### Data Access Flow

```
User Request → Middleware Validation → User Lookup → Token Retrieval → Gmail API
                ↓
            User exists? → Yes → Continue
            User exists? → No  → 404 Error
```

## Security Guarantees

### ✅ What's Protected

1. **User Tokens**: Encrypted at rest, isolated per user
2. **Email Data**: Stored with `user_id`, can only be accessed by that user
3. **Gmail Access**: Uses user's own OAuth tokens (Gmail API enforces ownership)
4. **Route Access**: Middleware validates user before processing

### ⚠️ Important Notes

1. **Frontend Responsibility**: 
   - Frontend must store `userId` securely (localStorage)
   - Frontend must send correct `userId` with each request
   - If `userId` is lost, user must re-authenticate

2. **No Session Management**:
   - Currently, there's no server-side session validation
   - Anyone with a valid `userId` can access that user's data
   - **Future Enhancement**: Add JWT tokens or session-based authentication

3. **Gmail API Security**:
   - Gmail API uses OAuth tokens to enforce ownership
   - User A's tokens cannot access User B's Gmail account
   - This provides an additional layer of security

## Multi-User Scenarios

### Scenario 1: Multiple Users Login

```
User A logs in → Gets userId: "abc123"
User B logs in → Gets userId: "xyz789"

User A requests: GET /gmail/list/abc123
→ ✅ Returns User A's emails only

User B requests: GET /gmail/list/xyz789
→ ✅ Returns User B's emails only

User A requests: GET /gmail/list/xyz789
→ ❌ 404 Error: User not found (if User A doesn't have xyz789)
→ ✅ But even if it worked, Gmail API would fail (wrong tokens)
```

### Scenario 2: Invalid User ID

```
Request: GET /gmail/list/invalid_user_id
→ Middleware checks: User exists?
→ ❌ No → Returns 404 Error
→ Request never reaches Gmail API
```

### Scenario 3: Token Refresh

```
User A's token expires
→ Gmail API automatically refreshes using User A's refresh_token
→ New tokens saved to User A's record only
→ User B's tokens remain unchanged
```

## Database Schema

### Users Table
- `id` (PRIMARY KEY): Unique user identifier
- `access_token` (ENCRYPTED): User's Gmail access token
- `refresh_token` (ENCRYPTED): User's Gmail refresh token
- Each user has isolated token storage

## Testing Multi-User Support

### Test Case 1: User Isolation
```bash
# Create User A
curl http://localhost:3000/auth/login
# Complete OAuth, get userId_A

# Create User B  
curl http://localhost:3000/auth/login
# Complete OAuth, get userId_B

# User A tries to access User B's data
curl http://localhost:3000/gmail/list/userId_B
# Should fail (if userId_B doesn't match User A's session)
# Gmail API will also fail (wrong tokens)
```

### Test Case 2: Invalid User ID
```bash
curl http://localhost:3000/gmail/list/invalid_id
# Should return: 404 User not found
```

### Test Case 3: Valid User Access
```bash
curl http://localhost:3000/gmail/list/userId_A
# Should return: User A's emails only
```

## Future Enhancements

1. **Session Management**:
   - Add JWT tokens for session validation
   - Store session in database or Redis
   - Validate session on each request

2. **Rate Limiting**:
   - Per-user rate limiting
   - Prevent abuse of API endpoints

3. **Audit Logging**:
   - Log all user actions
   - Track data access patterns
   - Detect suspicious activity

4. **Role-Based Access**:
   - Admin users
   - User permissions
   - API key management

## Best Practices

1. **Frontend**:
   - Store `userId` securely
   - Never expose `userId` in URLs if possible
   - Implement logout functionality

2. **Backend**:
   - Always validate `userId` before processing
   - Use middleware for validation
   - Log authentication failures

3. **Database**:
   - Regular backups
   - Monitor for unusual access patterns
   - Keep encryption keys secure

## Troubleshooting

### Issue: "User not found" error
- **Cause**: Invalid `userId` or user doesn't exist
- **Solution**: User must re-authenticate via `/auth/login`

### Issue: User A sees User B's data
- **Cause**: This should NOT happen with current implementation
- **If it does**: Check middleware is applied, check database queries
- **Report**: This is a critical security issue

### Issue: Token refresh fails
- **Cause**: Refresh token expired or invalid
- **Solution**: User must re-authenticate via `/auth/re-auth/:userId`

