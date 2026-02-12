# TenantTracker API v2.0

A comprehensive tenant management system built with Node.js, Express, and MongoDB. This application provides property owners with tools to manage tenants, properties, billing, and payments efficiently.

## Features

### For Property Owners
- **Property Management**: Add, update, and manage multiple properties
- **Tenant Management**: Track tenant information, lease details, and occupancy
- **Billing System**: Generate bills with itemized charges and utilities
- **Payment Tracking**: Record and track payments with multiple payment methods
- **Dashboard**: Comprehensive overview of properties, revenue, and alerts
- **Financial Reporting**: Revenue tracking, outstanding amounts, and payment statistics

### For Tenants
- **Dashboard**: View lease details, upcoming bills, and payment history
- **Bill Management**: Access current and past bills
- **Payment History**: Track all payments made

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: Helmet, bcrypt, rate limiting, input validation
- **Validation**: Joi for request validation
- **Logging**: Winston for comprehensive logging
- **Environment**: dotenv for configuration management

## Installation

1. **Clone the repository**
   ```bash
   cd src2
   npm install
   ```

2. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   NODE_ENV=development
   PORT=5000
   
   # Database
   MONGODB_URI=mongodb://localhost:27017/tenanttracker_v2
   
   # JWT Configuration
   JWT_SECRET=your-super-secure-jwt-secret-key-here
   JWT_EXPIRES_IN=7d
   
   # Security
   BCRYPT_ROUNDS=12
   
   # Rate Limiting
   RATE_LIMIT_MAX=100
   RATE_LIMIT_WINDOW=15
   ```

3. **Start MongoDB**
   Make sure MongoDB is running on your system.

4. **Run the application**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   
   # Run tests
   npm test
   ```

## API Documentation

### Base URL
```
http://localhost:5000/api
```

### Authentication Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/auth/register` | Register new user | Public |
| POST | `/auth/login` | User login | Public |
| GET | `/auth/profile` | Get user profile | Private |
| PUT | `/auth/profile` | Update user profile | Private |
| POST | `/auth/change-password` | Change password | Private |
| POST | `/auth/refresh-token` | Refresh JWT token | Private |
| POST | `/auth/logout` | User logout | Private |

### Property Endpoints (Owner Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/properties` | Create new property |
| GET | `/properties` | Get all properties |
| GET | `/properties/:id` | Get property by ID |
| PUT | `/properties/:id` | Update property |
| DELETE | `/properties/:id` | Delete property |
| GET | `/properties/:id/stats` | Get property statistics |
| GET | `/properties/:id/units` | Get available units |

### Tenant Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/tenants` | Create new tenant | Owner |
| GET | `/tenants` | Get all tenants | Owner |
| GET | `/tenants/dashboard` | Get tenant dashboard | Tenant |
| GET | `/tenants/expiring-leases` | Get expiring leases | Owner |
| GET | `/tenants/:id` | Get tenant by ID | Owner |
| PUT | `/tenants/:id` | Update tenant | Owner |
| DELETE | `/tenants/:id` | Delete tenant | Owner |
| POST | `/tenants/:id/notes` | Add tenant note | Owner |

### Bill Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/bills` | Create new bill | Owner |
| GET | `/bills` | Get bills | Owner/Tenant |
| GET | `/bills/summary` | Get bills statistics | Owner |
| POST | `/bills/generate-recurring` | Generate monthly bills | Owner |
| GET | `/bills/:id` | Get bill by ID | Owner/Tenant |
| PUT | `/bills/:id` | Update bill | Owner |
| DELETE | `/bills/:id` | Delete bill | Owner |
| POST | `/bills/:id/send` | Send bill to tenant | Owner |

### Payment Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/payments` | Record payment | Owner/Tenant |
| GET | `/payments` | Get payments | Owner/Tenant |
| GET | `/payments/stats` | Get payment statistics | Owner |
| GET | `/payments/:id` | Get payment by ID | Owner/Tenant |
| PUT | `/payments/:id` | Update payment | Owner |
| DELETE | `/payments/:id` | Delete payment | Owner |
| POST | `/payments/:id/refund` | Process refund | Owner |

### Dashboard Endpoint

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/dashboard` | Get dashboard data | Private |

## Request/Response Format

### Authentication Request
```json
{
  "email": "owner@example.com",
  "password": "securepassword"
}
```

### Authentication Response
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "user_id",
      "firstName": "John",
      "lastName": "Doe",
      "email": "owner@example.com",
      "role": "owner"
    },
    "token": "jwt_token_here"
  }
}
```

### Property Request
```json
{
  "name": "Sunset Apartments",
  "description": "Modern apartment complex",
  "address": {
    "street": "123 Main St",
    "city": "Anytown",
    "state": "CA",
    "zipCode": "12345",
    "country": "USA"
  },
  "propertyType": "apartment",
  "totalUnits": 24,
  "amenities": ["parking", "pool", "gym"]
}
```

### Bill Request
```json
{
  "tenant": "tenant_id",
  "billingPeriod": {
    "month": 12,
    "year": 2024
  },
  "charges": {
    "rent": 1200,
    "utilities": {
      "water": 50,
      "electricity": 80
    }
  },
  "dueDate": "2024-12-05T00:00:00.000Z"
}
```

### Payment Request
```json
{
  "bill": "bill_id",
  "amount": 1330,
  "paymentMethod": "bank_transfer",
  "paymentDate": "2024-12-01T00:00:00.000Z",
  "transactionId": "TXN123456"
}
```

## Error Handling

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message",
  "stack": "Error stack (development only)"
}
```

## Security Features

- **Password Hashing**: bcrypt with configurable rounds
- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Prevents API abuse
- **Input Validation**: Joi validation for all requests
- **Account Locking**: Protects against brute force attacks
- **CORS Protection**: Configurable cross-origin requests
- **Helmet Security**: Various HTTP security headers

## Database Models

### User Model
- Basic user information and authentication
- Role-based access (owner/tenant)
- Account security features

### Property Model
- Property details and address
- Amenities and images
- Occupancy tracking

### Tenant Model
- Lease details and occupant information
- Emergency contacts
- Notes and preferences

### Bill Model
- Itemized charges and utilities
- Billing periods and due dates
- Payment tracking

### Payment Model
- Payment details and methods
- Transaction tracking
- Refund handling

## Deployment

1. **Production Environment Variables**
   ```env
   NODE_ENV=production
   MONGODB_URI=your-production-mongodb-url
   JWT_SECRET=production-jwt-secret
   ```

2. **Build and Start**
   ```bash
   npm run build
   npm start
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support or questions, please contact the development team or create an issue in the repository.