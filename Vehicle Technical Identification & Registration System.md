# Vehicle Technical Identification & Registration System (VTIRS)

> Dashen Bank – IT Modernization Department
>
> Project Priority: **High (Priority 2)**
>
> Work Unit: **Facilities**
>
> Project Type: **Digitization**
>
> Owner: **IT Modernization Department**
>
> Status: **Initiation Phase**

---

# 1. Overview

The Vehicle Technical Identification & Registration System (VTIRS) is a centralized web-based application developed for Dashen Bank's Facilities Department to digitally manage all organizational vehicles.

The primary purpose of the system is to replace spreadsheets and paper records with a secure digital repository that maintains complete technical information about every vehicle owned or managed by Dashen Bank.

The system will provide a single source of truth for vehicle information including:

- Vehicle identification
- Engine information
- Chassis information
- Registration status
- Ownership history
- Insurance information
- Technical specifications
- Supporting documents

The application should help the Facilities Department quickly locate vehicles, monitor document expirations, and maintain accurate technical records.

---

# 2. Objectives

The system should:

- Digitize all vehicle records
- Eliminate manual spreadsheets
- Improve vehicle traceability
- Prevent duplicate registrations
- Track registration renewals
- Track insurance expirations
- Store technical documentation
- Improve reporting
- Improve audit readiness
- Support future integrations

---

# 3. Expected Users

### Facilities Administrator

Responsible for managing all vehicles.

Permissions:

- Full CRUD
- Upload documents
- Approve changes
- Generate reports

---

### Facilities Officer

Responsible for maintaining daily records.

Permissions

- Register vehicles
- Edit vehicle information
- Upload documents
- Search vehicles

---

### Management

Read-only dashboard

Permissions

- View dashboards
- View reports
- Export reports

---

### System Administrator

Responsible for

- User management
- Roles
- Permissions
- Audit logs
- System configuration

---

# 4. Core Modules

---

## 4.1 Dashboard

The dashboard should display:

- Total Vehicles
- Active Vehicles
- Expired Registration
- Registration Expiring Soon
- Insurance Expiring Soon
- Vehicles by Type
- Vehicles by Branch
- Vehicles by Status

Charts

- Vehicles by Brand
- Vehicles by Model
- Vehicles by Year
- Vehicles by Fuel Type

Recent Activity

Upcoming Expirations

Quick Search

---

## 4.2 Vehicle Registry

The heart of the system.

Each vehicle has one master record.

Vehicle fields:

### Basic Information

- Vehicle ID (System Generated)
- Plate Number
- Previous Plate Number
- Vehicle Category
- Vehicle Type
- Make
- Model
- Trim
- Manufacturing Year
- Color

---

### Technical Identification

- Engine Number
- Chassis Number (VIN)
- Engine Capacity (CC)
- Fuel Type
- Transmission
- Drive Type
- Odometer Reading

---

### Registration

- Registration Number
- Registration Date
- Registration Expiry Date
- Registration Office
- Registration Status

Status

- Active
- Pending Renewal
- Expired
- Suspended

---

### Ownership

- Owner Name
- Department
- Assigned Branch
- Current Driver
- Acquisition Date
- Purchase Cost
- Supplier

---

### Insurance

- Insurance Company
- Policy Number
- Coverage Type
- Start Date
- End Date

---

### Technical Information

- Chassis Photo
- Engine Photo
- Vehicle Photos
- Registration Certificate
- Insurance Certificate

---

### Status

- Active
- Under Maintenance
- Assigned
- Reserved
- Disposed

---

## 4.3 Registration Management

Features

- Register new vehicle
- Renew registration
- Suspend registration
- Archive registration
- Registration history
- Renewal reminders

Automatic reminders

- 90 days
- 60 days
- 30 days
- 7 days

before expiry.

---

## 4.4 Document Management

Store

- Registration certificate
- Insurance
- Purchase agreement
- Inspection certificate
- Photos
- Service documents

Supported files

- PDF
- JPG
- PNG

Preview inside browser

Version history

Download

---

## 4.5 Search

Global search

Search by

- Plate Number
- Engine Number
- Chassis Number
- Vehicle ID
- Branch
- Driver
- Registration Number

Advanced filters

- Status
- Year
- Branch
- Vehicle Type
- Registration Status

---

## 4.6 Reports

Reports

Vehicle Inventory

Registration Status

Registration Expiry

Insurance Expiry

Vehicles by Branch

Vehicles by Department

Vehicle Age

Vehicle Cost

Export

- PDF
- Excel
- CSV

---

## 4.7 Notifications

Email notifications

Dashboard notifications

Registration reminders

Insurance reminders

Expired document alerts

---

## 4.8 Audit Trail

Every action logged

Who

When

Old Value

New Value

IP Address

Browser

---

# 5. Non Functional Requirements

Authentication

Role Based Access Control (RBAC)

Audit Logging

Responsive Design

Fast Search

Secure File Upload

Automatic Backup

Data Validation

Duplicate Detection

Encryption at Rest

Encryption in Transit

---

# 6. Suggested Database Tables

users

roles

permissions

vehicles

vehicle_documents

vehicle_images

vehicle_registration

vehicle_registration_history

vehicle_insurance

vehicle_assignments

branches

departments

drivers

manufacturers

vehicle_models

vehicle_audit_logs

notifications

settings

---

# 7. Dashboard KPIs

Total Vehicles

Registered Vehicles

Expired Registration

Pending Registration

Insurance Expiring

Assigned Vehicles

Vehicles Under Maintenance

Disposed Vehicles

Average Vehicle Age

Newest Vehicle

Oldest Vehicle

---

# 8. Future Integrations

Although not required for Version 1:

ERP

Fleet Management

GPS Tracking

Fuel Management

Maintenance Management

HR Driver Database

National Registration System

Insurance Providers

Mobile Application

Barcode / QR Code

RFID

---

# 9. Technology Recommendation

Frontend

React + TypeScript

Backend

ASP.NET Core Web API

Database

SQL Server

Authentication

JWT

File Storage

Local Storage (V1)

Cloud/Object Storage (Future)

Charts

Apache ECharts

Reporting

FastReport / QuestPDF

---

# 10. UI / UX Design Guidelines

The UI must follow Dashen Bank's branding.

## Primary Colors

Primary Blue

#273274

Secondary Blue

#012169

Accent

#FDD79A

---

## Theme

Professional

Modern Banking

Minimal

Clean

Enterprise Dashboard

Rounded cards

Soft shadows

Generous whitespace

---

## Layout

Top Navigation Bar

Left Sidebar

Responsive Dashboard

Large Data Tables

Advanced Filters

Breadcrumb Navigation

Statistics Cards

Interactive Charts

---

## Components

Dashboard

Vehicle List

Vehicle Details

Registration History

Document Viewer

Notifications

Reports

Settings

User Management

Audit Logs

---

## Icons

Use Lucide Icons

Examples

Car

FileText

Shield

Clipboard

Bell

Users

MapPin

Search

Settings

Calendar

History

---

## Typography

Font

Inter

Fallback

Segoe UI

Sans-serif

---

## Design Inspiration

Microsoft Fluent Design

Azure Portal

GitHub Enterprise

Linear

Modern Banking Dashboards

---

# 11. Project Philosophy

This system should not feel like a simple CRUD application.

It should feel like an enterprise-grade internal platform built for Dashen Bank's Facilities Department.

Prioritize:

- Excellent search performance
- Professional dashboards
- Strong data validation
- Clean UI
- Excellent reporting
- Scalable architecture
- Easy maintenance
- Future integration readiness