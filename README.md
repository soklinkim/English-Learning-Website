# English Online Learning Platform - Requirements Specification

Oct 9, 2026 · @LAE

## 1. Overview and goals

The English Online Learning Platform is a backend of five microservices where students register, enroll in English courses, read lessons and track their progress, and admins manage the content. A web frontend is built on top once the backend passes its tests.

**Goals**

- Build the backend as independent microservices split by business area, not by user role.
- Secure every protected endpoint with JWT authentication and role-based authorization (Admin, Student).
- Persist data in MongoDB, with one database per service.
- Run every service in its own Docker container, behind one public API Gateway.
- Deploy online on AWS EC2 and keep the system ready to grow into a real public website.

**Success looks like:** every acceptance scenario in section 9 passes against the local Docker setup and against the EC2 deployment, and no endpoint is reachable without the right token and role.

## Current implementation status and local run

All five services are implemented: API Gateway (3000), Registration (3001), Login (3002), Content (3003) and Learning (3004). Docker Compose is written but not yet tested end to end. The Postman suite in section 9 is not complete yet; the manual steps below cover the main flow.

Registration always creates accounts with the role `user` (a student). The role is never read from the request body, so admins are created with a seed script (step 1).

### Testing step 1: create an admin account

Admins cannot register through the API. From the `registration-service` folder, run the seed script in PowerShell:

```powershell
$env:ADMIN_EMAIL="admin@example.com"; $env:ADMIN_PASSWORD="admin12345"; node seedAdmin.js
```

It prints `Admin admin@example.com created`. If the email is already registered, that account is promoted to admin and its password is left unchanged. The role is stored inside the JWT, so log in again after promotion to get a token with the admin role.

### Testing step 2: start every service

Each service `.env` needs a valid `MONGO_URI` and the same `JWT_SECRET`. Registration and Login must use the same database. The Content `.env` needs `LEARNING_SERVICE_URL=http://localhost:3004`, and the Learning `.env` needs `CONTENT_SERVICE_URL=http://localhost:3003`. Your current IP must be on the Atlas Network Access list.

Open five PowerShell windows from the repository root and run one service in each:

```powershell
Set-Location .\registration-service
node .\server.js
```

Repeat for `login-service`, `content-service`, `learning-service` and `api-gateway`. Each prints "Connected to MongoDB" (the gateway has no database) and a "running on port" line. Environment files are read only at startup, so restart a service after editing its `.env`. Check the gateway with `GET http://localhost:3000/health`.

### Testing step 3: call the API through the gateway (port 3000)

Register a student with `POST http://localhost:3000/register/userregister` and a raw JSON body:

```json
{
  "name": "Test Student",
  "email": "student@example.com",
  "password": "example123",
  "phone": "5551234567"
}
```

Log in with `POST http://localhost:3000/auth/login` and a body of `{ "email": "...", "password": "..." }` for both the student and the admin. Each response contains a `token`. For every `/api` request, set Authorization to Bearer Token in Postman and paste the token without quote marks. Then run the requests below in order:

| # | Request | As | Expect |
| --- | --- | --- | --- |
| 1 | `GET /api/courses` with no token | none | 401 |
| 2 | `POST /api/courses` with `{"title":"English A1","level":"Beginner"}` | student | 403 |
| 3 | `POST /api/courses` with the same body | admin | 201, copy the course `_id` |
| 4 | `POST /api/lessons` with `{"courseId":"<id>","title":"Lesson 2","order":2}`, then again with `"Lesson 1"` and `order` 1 | admin | 201 each |
| 5 | `POST /api/lessons` with a valid but unknown ObjectId as `courseId` | admin | 404 |
| 6 | `GET /api/courses/<id>/lessons` | student | 403 (not enrolled) |
| 7 | `POST /api/enrollments` with `{"courseId":"<id>"}` | student | 201, then 409 the second time |
| 8 | `GET /api/courses/<id>/lessons` | student | 200, sorted Lesson 1 then Lesson 2 |
| 9 | `POST /api/progress` with `{"courseId":"<id>","lessonId":"<lesson 1 _id>"}` | student | 201, and 201 again with one record |
| 10 | `GET /api/progress/course/<id>` | student | 50% |
| 11 | Complete lesson 2, then repeat request 10 | student | 100% |
| 12 | `GET /api/progress/student/<student id>` and `GET /api/enrollments/course/<id>` | admin | 200 with data |
| 13 | `GET /api/enrollments` | student | 403 |
| 14 | `DELETE /api/enrollments/<enrollment _id>` | student | 200, progress removed |
| 15 | `DELETE /api/courses/<id>` | admin | 200, its lessons are gone |
| 16 | Stop the Content service, then `GET /api/courses` | admin | 502 |

Troubleshooting:

- **401 "Invalid token":** the token is in the URL or has quote marks. Use the Authorization tab.
- **403 on an admin request:** the account's role is not `admin`, or the token was issued before the promotion. Log in again.
- **"LEARNING_SERVICE_URL is not configured" or 503:** a service was started before its `.env` was edited, or the Learning service is not running. Restart both.
- **Login fails for a registered user:** Registration and Login point at different databases, or an old process still holds port 3002.
- **Cannot connect to MongoDB:** add your IP in Atlas under Network Access.

## 2. Scope

The work is delivered in three layers, in this order.

| Layer | What it contains | Status |
| --- | --- | --- |
| Base backend | The five services, JWT and RBAC, MongoDB, Docker Compose, Postman test suite | In progress; all five services are implemented, Docker and the Postman suite are not yet verified |
| Production hardening | HTTPS, rate limiting, admin-signup restriction, password reset, backups, monitoring, media storage (section 10) | After the base backend works |
| Frontend | Web app for students and admins that calls only the API Gateway | After the base backend works |

**Out of scope for now:** payments, live classes and video calls, certificates, a teacher role, mobile apps, and automated recommendations. A teacher role can be added later as one more role value without a new service.

## 3. User roles

The platform has two roles, stored in the JWT. A role is a set of permissions, not a separate service.

| Capability | Student | Admin |
| --- | --- | --- |
| Register and log in | Yes | Yes |
| View courses and course details | Yes | Yes |
| Create, update, delete courses | No | Yes |
| Create, update, delete lessons | No | Yes |
| Read lessons | Only in enrolled courses | All |
| Enroll in and leave a course | Yes | No |
| View own enrollments | Yes | No |
| View all enrollments | No | Yes |
| Mark a lesson completed | Yes | No |
| View own progress | Yes | No |
| View any student's progress | No | Yes |

A request with a valid token but the wrong role gets 403 Forbidden. A request with no token or a bad token gets 401 Unauthorized.

## 4. Functional requirements by service

The system has five services, each owning one business area and its data. Every requirement has an ID so tests can refer to it.

### 4.1 Registration Service (port 3001)

| ID | Requirement |
| --- | --- |
| REG-1 | Create an account from name, email, password and role. |
| REG-2 | Validate input: name required, valid email format, password at least 6 characters, role is admin or student. |
| REG-3 | Reject a duplicate email with 409 Conflict. |
| REG-4 | Hash passwords with bcrypt before storing; never store plain text. |
| REG-5 | Never return the password hash in any response. |

### 4.2 Login Service (port 3002)

| ID | Requirement |
| --- | --- |
| LOG-1 | Verify email and password against the stored hash. |
| LOG-2 | Issue a JWT containing userId, email and role, with an expiry time. |
| LOG-3 | Return the same 401 message for an unknown email and a wrong password, so accounts cannot be guessed. |
| LOG-4 | Read the signing secret from an environment variable, never from source code. |

### 4.3 Content Service (port 3003)

Owns courses and lessons.

| ID | Requirement |
| --- | --- |
| CON-1 | Admin can create, update and delete courses (title required; level is Beginner, Intermediate or Advanced). |
| CON-2 | Students and admins can list courses and view one course's details. |
| CON-3 | Admin can create, update and delete lessons that belong to a course, with an order number. |
| CON-4 | Creating a lesson for a course that does not exist returns 404. |
| CON-5 | Deleting a course also deletes all of its lessons. |
| CON-6 | Lessons of a course are returned sorted by order. |
| CON-7 | A student can read a course's lessons only if enrolled in it; an admin can always read them. |

### 4.4 Learning Service (port 3004)

Owns enrollments and progress.

| ID | Requirement |
| --- | --- |
| LRN-1 | A student can enroll in an existing course; an unknown course returns 404. |
| LRN-2 | A second enrollment in the same course returns 409 Conflict. |
| LRN-3 | A student can list their enrolled courses with course details. |
| LRN-4 | A student can leave a course; this also deletes their progress in that course. Students can only remove their own enrollments. |
| LRN-5 | An admin can list all enrollments, or the enrollments of one course. |
| LRN-6 | A student can mark a lesson completed only if enrolled and the lesson belongs to that course. |
| LRN-7 | Marking the same lesson completed twice is harmless and creates no duplicate. |
| LRN-8 | A student can view their progress per course: completed lessons and completion percentage. |
| LRN-9 | An admin can view any student's progress. |

### 4.5 API Gateway (port 3000)

| ID | Requirement |
| --- | --- |
| GW-1 | Be the only service reachable from outside; all others are private. |
| GW-2 | Route each /api path to the right service. |
| GW-3 | Verify the JWT on protected routes and forward the Authorization header. |
| GW-4 | Leave /api/register, /api/login and /health public. |
| GW-5 | Return 502 with a clear message when a downstream service is down. |
| GW-6 | Allow cross-origin requests from the configured frontend origin only (CORS). |

## 5. Non-functional requirements

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-1 | Security | JWT is required on every protected endpoint; the gateway and each service both verify it. |
| NFR-2 | Security | Role checks run as middleware in every service, so a service stays safe even if called directly. |
| NFR-3 | Security | Secrets (JWT secret, database URI) live in environment variables and are never committed to Git. |
| NFR-4 | Security | All input is validated; invalid ids and bodies return 400, not a server error. |
| NFR-5 | Reliability | A failing downstream service produces a clear 502 or 503 response and does not crash the caller. |
| NFR-6 | Reliability | Unhandled errors return a generic 500 message with no stack trace. |
| NFR-7 | Data | Each service owns its own database; no service writes into another's database. The Login Service only reads the users collection. |
| NFR-8 | Data | Unique indexes prevent duplicate emails, duplicate enrollments and duplicate lesson completions. |
| NFR-9 | Scalability | Services are stateless, so any service can run as several copies behind a load balancer; in phase 2 Nginx balances traffic across gateway copies. |
| NFR-10 | Deployability | Each service has its own Dockerfile and starts with one command through Docker Compose. |
| NFR-11 | Deployability | Only the gateway port is published to the host; the database is never exposed publicly. |
| NFR-12 | Observability | Every service has a /health endpoint, and the gateway logs each request. |
| NFR-13 | Maintainability | Each service has a README, an .env.example, and the same folder layout. |

## 6. Data model

Three MongoDB databases hold five collections. All ids are MongoDB ObjectIds; ids that point at another service's data are stored as plain strings, with no database-level link.

| Database | Collection | Fields | Rules |
| --- | --- | --- | --- |
| registration\_db | users | name, email, password (bcrypt hash), role, createdAt | email unique and lowercase; role is admin or student |
| content\_db | courses | title, description, level, createdBy (admin id), createdAt | level is Beginner, Intermediate or Advanced |
| content\_db | lessons | courseId, title, content, order, createdAt | indexed by courseId; deleted with their course |
| learning\_db | enrollments | studentId, courseId, enrolledAt | unique on studentId + courseId |
| learning\_db | progress | studentId, courseId, lessonId, completed, completedAt | unique on studentId + lessonId |

The Registration Service writes the users collection. The Login Service reads it to verify passwords.

## 7. API summary

All paths go through the API Gateway on port 3000. Protected routes need the header Authorization: Bearer \<token>.

| Method | Path | Handled by | Access |
| --- | --- | --- | --- |
| POST | /register/userregister | Registration | Public |
| POST | /auth/login | Login | Public |
| GET | /api/courses | Content | Student, Admin |
| GET | /api/courses/:id | Content | Student, Admin |
| POST | /api/courses | Content | Admin |
| PUT | /api/courses/:id | Content | Admin |
| DELETE | /api/courses/:id | Content | Admin |
| GET | /api/courses/:courseId/lessons | Content | Admin, or Student enrolled in the course |
| GET | /api/lessons/:id | Content | Admin, or Student enrolled in the course |
| POST | /api/lessons | Content | Admin |
| PUT | /api/lessons/:id | Content | Admin |
| DELETE | /api/lessons/:id | Content | Admin |
| POST | /api/enrollments | Learning | Student |
| GET | /api/enrollments/my-courses | Learning | Student |
| DELETE | /api/enrollments/:id | Learning | Student (own only) |
| GET | /api/enrollments | Learning | Admin |
| GET | /api/enrollments/course/:courseId | Learning | Admin |
| POST | /api/progress | Learning | Student |
| GET | /api/progress/my-progress | Learning | Student |
| GET | /api/progress/course/:courseId | Learning | Student |
| GET | /api/progress/student/:studentId | Learning | Admin |
| GET | /health | Gateway | Public |

**Status codes:** 200 and 201 for success, 400 for invalid input, 401 for a missing or bad token, 403 for the wrong role, 404 when something does not exist, 409 for duplicates, 502 or 503 when a downstream service is unavailable.

## 8. Technology stack and deployment

| Component | Choice |
| --- | --- |
| Language and runtime | JavaScript on Node.js 22 |
| Web framework | Express.js 5 |
| Database | MongoDB Atlas (managed), accessed with Mongoose |
| Authentication | JSON Web Tokens (jsonwebtoken) |
| Password hashing | bcrypt |
| Gateway | Express with http-proxy-middleware |
| Containers | Docker and Docker Compose |
| Hosting | AWS EC2 (Ubuntu) running Docker Compose |
| API testing | Postman |
| Version control | Git and GitHub |
| Reverse proxy and load balancer | Nginx (phase 2), with Certbot for HTTPS |

**Ports:** gateway 3000, registration 3001, login 3002, content 3003, learning 3004.

**Deployment rules**

- Only port 3000 (the gateway) is opened to the internet in the base project, and ports 80 and 443 (Nginx) in phase 2 with port 3000 closed; port 22 is limited to the owner's IP.
- Services reach each other over the Docker network by service name.
- The EC2 server's IP is added to the Atlas network access list.
- The database connection string and JWT secret are set in a .env file on the server, not in Git.

## 9. Acceptance criteria and testing

The base backend is accepted when every scenario below passes in Postman, first against Docker on the developer's machine and then against the EC2 deployment.

| ID | Scenario | Expected result | Proves |
| --- | --- | --- | --- |
| AC-1 | Register an admin and a student | 201, no password in the response | REG-1, REG-5 |
| AC-2 | Register the same email twice | 409 | REG-3 |
| AC-3 | Register with a bad role or short password | 400 | REG-2 |
| AC-4 | Check the database | Password stored as a bcrypt hash | REG-4 |
| AC-5 | Log in as admin and as student | 200 and a JWT with the right role | LOG-1, LOG-2 |
| AC-6 | Log in with a wrong password or unknown email | 401, same message both times | LOG-3 |
| AC-7 | Call a protected route with no token or a garbage token | 401 | NFR-1, GW-3 |
| AC-8 | Student tries to create a course, list all enrollments or view another student's progress | 403 | NFR-2 |
| AC-9 | Admin creates, updates and lists a course | 201 then 200 | CON-1, CON-2 |
| AC-10 | Admin adds two lessons in order 1 and 2 | Returned sorted by order | CON-3, CON-6 |
| AC-11 | Admin adds a lesson to a course id that does not exist | 404 | CON-4 |
| AC-12 | Student reads lessons before enrolling | 403 | CON-7 |
| AC-13 | Student enrolls, then enrolls again | 201 then 409 | LRN-1, LRN-2 |
| AC-14 | Student reads lessons after enrolling | 200 with both lessons | CON-7 |
| AC-15 | Student completes lesson 1, then lesson 1 again | 201 both times, one record | LRN-6, LRN-7 |
| AC-16 | Student views course progress | 50% after one of two lessons, 100% after both | LRN-8 |
| AC-17 | Admin views that student's progress and the course's enrollments | 200 with data | LRN-5, LRN-9 |
| AC-18 | Student leaves the course | 200, enrollment and course progress gone | LRN-4 |
| AC-19 | Admin deletes the course | 200, its lessons are gone too | CON-5 |
| AC-20 | Stop the Content container and call a lesson route | 502 or 503 with a clear message, no crash | NFR-5, GW-5 |
| AC-21 | Call a service port directly from outside the server | Connection refused | GW-1, NFR-11 |

The Postman collection holds one request per scenario with built-in assertions, so one run of the collection is the full regression test.

## 10. Phase 2: production hardening

These requirements start only after section 9 passes. They are what turns a working class project into a site real users can safely use.

| ID | Requirement | Why it matters |
| --- | --- | --- |
| HRD-1 | Put Nginx in front of the gateway as a reverse proxy: serve everything over HTTPS with a domain name and a free Let's Encrypt certificate, serve the frontend from Nginx, and close port 3000 to the internet. | Passwords and tokens must not travel in plain text. |
| HRD-2 | Only students can self-register; admin accounts are created by a seed script or an admin-only endpoint. | Today anyone can register as admin. |
| HRD-3 | Rate-limit /api/login and /api/register per IP address. | Stops password guessing and signup spam. |
| HRD-4 | Raise the minimum password length to 8 and lock an account briefly after repeated failed logins. | Stronger protection against guessing. |
| HRD-5 | Add short-lived access tokens plus refresh tokens, and a logout that invalidates the refresh token. | Limits damage if a token leaks. |
| HRD-6 | Add email verification and a password-reset flow. | Users expect both, and reset avoids support requests. |
| HRD-7 | Store lesson media (audio, video, images) in object storage such as S3, with only the URL in the database. | Media is large and does not belong in MongoDB. |
| HRD-8 | Turn on Atlas backups and test one restore. | Data survives mistakes and failures. |
| HRD-9 | Add structured logs, uptime checks on /health, and alerts. | Problems are seen before users report them. |
| HRD-10 | Add security headers (Helmet), restrict CORS to the real frontend domain, and add database indexes for the common queries. | Basic hardening and speed. |
| HRD-11 | Add automated tests to the build (unit and API tests) and a CI pipeline that builds the images. | Changes stop breaking working features. |
| HRD-12 | Run two or more copies of the gateway (and of busy services) behind Nginx with least-connections load balancing, and confirm that stopping one copy causes no downtime. | Handles more traffic and survives a failing copy. |

## 11. Build roadmap, assumptions and limitations

**Build order** (one service at a time, each tested in Postman before the next):

1. Project folder, MongoDB Atlas, Registration Service
2. Login Service (JWT)
3. Content Service (courses, lessons, JWT and role middleware)
4. Learning Service (enrollments, progress)
5. API Gateway
6. Dockerfiles and docker-compose
7. Full Postman test run (section 9)
8. Deploy to AWS EC2
9. Production hardening (section 10)
10. Frontend

**Assumptions**

- A student must be enrolled to read lessons, so the Content Service asks the Learning Service whether the student is enrolled. Learning also asks Content whether a course or lesson exists, so the two services call each other; this is accepted for the base project.
- Atlas free tier (M0) is enough for development and a small launch.
- One EC2 instance with at least 2 GB of memory runs all containers.

**Known limitations of the base project**

- Admin self-registration is open until HRD-2 is done.
- Services call each other directly over HTTP; if one is down, features that depend on it fail instead of queueing. Events or a message queue would remove this later.
- The Login Service reads the users collection owned by the Registration Service; a single user and auth service would be cleaner.
- There is no teacher role yet; it can be added as a role value plus a few authorization rules.
