# TenantTracker API - Postman Collection Setup Guide

## 📦 Import Instructions

### Step 1: Import the Collection
1. Open Postman
2. Click on **"Import"** button (top left)
3. Select **"File"** tab
4. Choose `TenantTracker_API. postman_collection.json`
5. Click **"Import"**

## ⚙️ Configuration

### Collection Variables
The collection uses two variables that you can configure:

1. **baseUrl**: Default is `http://localhost:3000/api`
   - Update this if your API runs on a different port or domain
   - To change: Right-click collection → Edit → Variables tab

2. **authToken**: Automatically set after login
   - Gets populated automatically when you login
   - Used for authenticated requests

### Manual Configuration
If you need to manually set variables:
1. Right-click on **"TenantTracker API"** collection
2. Select **"Edit"**
3. Go to **"Variables"** tab
4. Update the **Current Value** column:
   - `baseUrl`: Your API base URL (e.g., `http://localhost:3000/api`)
   - `authToken`: Leave empty (will be set automatically after login)

## 🚀 Quick Start Testing Guide

### 1. Health Check
Start by testing if your API is running:
- **Request**: `Health Check → Health Status`
- **Expected**: 200 OK with service information

### 2. Owner Flow

#### Step 1: Register as Owner
- **Request**: `Authentication → Register User`
- **Body**: Uses example owner data
- **Result**: Auto-saves auth token

#### Step 2: Login
- **Request**: `Authentication → Login`
- **Body**: 
  ```json
  {
    "email": "owner@example.com",
    "password": "Password123!"
  }
  ```
- **Result**: Auto-saves new auth token

#### Step 3: Create a Property
- **Request**: `Properties → Create Property`
- **Body**: Example property with all fields
- **Save**: Copy the property `_id` from response

#### Step 4: Register a Tenant User
- **Request**: `Authentication → Register Tenant User`
- **Save**: Copy the user `_id` from response

#### Step 5: Create Tenant Record
- **Option 1 - With New User**: `Tenants → Create Tenant`
  - Sends user details as an object (firstName, lastName, email, password, etc.)
  - Backend creates the user account automatically
  - **Update body** with:
    - `property`: Property ID from Step 3
    - Leave `user` object as is with new user details

- **Option 2 - With Existing User**: `Tenants → Create Tenant (Existing User)`
  - Sends user ID as a string
  - Use this if user already exists
  - **Update body** with:
    - `user`: User ID from Step 4
    - `property`: Property ID from Step 3

- **Save**: Copy the tenant `_id` from response

#### Step 6: Create a Bill
- **Request**: `Bills → Create Bill`
- **Update body** with:
  - `tenant`: Tenant ID from Step 5
- **Save**: Copy the bill `_id` from response

#### Step 7: Record Payment
- **Request**: `Payments → Create Payment`
- **Update body** with:
  - `bill`: Bill ID from Step 6

#### Step 8: View Dashboard
- **Request**: `Dashboard → Get Dashboard (Owner)`
- **Result**: See all statistics and recent activities

### 3. Tenant Flow

#### Step 1: Login as Tenant
- **Request**: `Authentication → Login`
- **Body**:
  ```json
  {
    "email": "tenant@example.com",
    "password": "Password123!"
  }
  ```

#### Step 2: View Tenant Dashboard
- **Request**: `Tenants → Get Tenant Dashboard`
- **Result**: See tenant-specific information

#### Step 3: View Bills
- **Request**: `Bills → Get All Bills (Tenant)`
- **Result**: See all bills for this tenant

#### Step 4: View Payments
- **Request**: `Payments → Get All Payments (Tenant)`
- **Result**: See all payments made

#### Step 5: View Dashboard
- **Request**: `Dashboard → Get Dashboard (Tenant)`
- **Result**: See tenant dashboard with lease info

## 📂 Collection Structure

```
TenantTracker API
├── Health Check
│   └── Health Status (Public)
├── Authentication
│   ├── Register User (Public)
│   ├── Register Tenant User (Public)
│   ├── Login (Public)
│   ├── Get Profile (Auth Required)
│   ├── Update Profile (Auth Required)
│   ├── Change Password (Auth Required)
│   ├── Refresh Token (Auth Required)
│   ├── Logout (Auth Required)
│   ├── Forgot Password (Public)
│   └── Reset Password (Public)
├── Dashboard
│   ├── Get Dashboard (Owner) (Owner Only)
│   └── Get Dashboard (Tenant) (Tenant Only)
├── Properties
│   ├── Create Property (Owner Only)
│   ├── Get All Properties (Owner Only)
│   ├── Get Property by ID (Owner Only)
│   ├── Update Property (Owner Only)
│   ├── Delete Property (Owner Only)
│   ├── Get Property Statistics (Owner Only)
│   └── Get Available Units (Owner Only)
├── Tenants
│   ├── Create Tenant (Owner Only)
│   ├── Create Tenant (Existing User) (Owner Only)
│   ├── Get All Tenants (Owner Only)
│   ├── Get Tenant Dashboard (Tenant Only)
│   ├── Get Expiring Leases (Owner Only)
│   ├── Get Tenant by ID (Owner Only)
│   ├── Update Tenant (Owner Only)
│   ├── Delete Tenant (Owner Only)
│   └── Add Tenant Note (Owner Only)
├── Bills
│   ├── Create Bill (Owner Only)
│   ├── Get All Bills (Owner)
│   ├── Get All Bills (Tenant)
│   ├── Get Bills Summary (Owner Only)
│   ├── Generate Recurring Bills (Owner Only)
│   ├── Get Bill by ID (Auth Required)
│   ├── Update Bill (Owner Only)
│   ├── Delete Bill (Owner Only)
│   └── Send Bill to Tenant (Owner Only)
└── Payments
    ├── Create Payment (Owner & Tenant)
    ├── Create Payment - Check (Owner & Tenant)
    ├── Create Payment - Bank Transfer (Owner & Tenant)
    ├── Get All Payments (Owner)
    ├── Get All Payments (Tenant)
    ├── Get Payment Statistics (Owner Only)
    ├── Get Payment by ID (Auth Required)
    ├── Update Payment (Owner Only)
    ├── Delete Payment (Owner Only)
    └── Process Refund (Owner Only)
```

## 🔑 Authentication

Most endpoints require authentication. The collection automatically handles this:

1. **Login** or **Register** → Token is auto-saved to `authToken` variable
2. All authenticated requests use: `Authorization: Bearer {{authToken}}`
3. Token is automatically included in protected endpoints

### Manual Token Update
If needed, update token manually:
1. Collection → Edit → Variables
2. Set `authToken` value
3. Save

## 🎯 Features

### Auto-Save Auth Token
The collection includes scripts that automatically save your auth token after:
- Registration
- Login

### Flexible Tenant Creation
The API supports two ways to create tenants:
1. **New User**: Send `user` as an object with user details (firstName, lastName, email, password, etc.)
   - Backend automatically creates the user account and tenant record
2. **Existing User**: Send `user` as a string (user ID)
   - Backend links existing user to the tenant record

### Query Parameters
Many list endpoints support pagination:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)
- `sort`: Sort field (prefix `-` for descending, e.g., `-createdAt`)
- `search`: Search term
- `searchFields`: Fields to search in

Example:
```
GET {{baseUrl}}/properties?page=1&limit=20&sort=-createdAt&search=apartment
```

### Path Variables
Endpoints with `:id` parameter:
- Click on request
- Go to **"Params"** tab
- Update the **Path Variables** section
- Replace placeholder values (e.g., `property-id-here`)

## 📝 Example Scenarios

### Scenario 1: Onboard New Tenant
1. Create tenant user account (Register Tenant User)
2. Add tenant to property (Create Tenant)
3. Generate first bill (Create Bill)
4. Send bill to tenant (Send Bill to Tenant)

### Scenario 2: Process Monthly Rent
1. Generate recurring bills for all tenants (Generate Recurring Bills)
2. Tenants view their bills (Get All Bills - Tenant)
3. Record payments (Create Payment)
4. View payment statistics (Get Payment Statistics)

### Scenario 3: Property Management
1. Create property (Create Property)
2. View available units (Get Available Units)
3. Check property statistics (Get Property Statistics)
4. Monitor expiring leases (Get Expiring Leases)

## 🐛 Troubleshooting

### Issue: 401 Unauthorized
**Solution**: 
- Login again to refresh token
- Check if token is saved in collection variables

### Issue: 404 Not Found
**Solution**:
- Verify API is running on correct port
- Check `baseUrl` variable matches your server
- Ensure path variables (`:id`) are updated with actual IDs

### Issue: 403 Forbidden
**Solution**:
- Verify you're using correct role (owner/tenant)
- Some endpoints are owner-only or tenant-only

### Issue: 400 Bad Request / Validation Error
**Solution**:
- Check request body matches validation schema
- Verify all required fields are included
- Check data types (dates, numbers, etc.)

## 📞 Support

For issues or questions:
1. Check API server logs
2. Verify MongoDB connection
3. Review validation errors in response
4. Check collection variable values

## 🔄 Version
- **Collection Version**: 2.1.0
- **API Version**: 2.0.0
- **Last Updated**: February 2026

---

**Happy Testing! 🚀**
