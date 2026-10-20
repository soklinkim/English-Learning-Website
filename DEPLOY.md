# Deploy to AWS EC2: three instances

```
Browser / Postman
        |  port 80 (public)
        v
EC2 #1  "lb"        Nginx load balancer         docker-compose.lb.yml
        |  round robin, private IPs, port 3000
        +--> EC2 #2 "backend-1"  full backend stack   docker-compose.backend.yml
        +--> EC2 #3 "backend-2"  full backend stack   docker-compose.backend.yml
                         both use the same MongoDB Atlas database and the same JWT_SECRET
```

Each backend runs all five services. They are stateless: the user's identity is in the JWT and the data is in Atlas, so any backend can answer any request.

## 0. Before you start

1. **Rotate the Atlas database password** (Atlas -> Database Access -> edit user). The old one has been exposed.
2. **Put the project on GitHub** (private repository) so the servers can clone it. In the project folder:
   ```powershell
   git init
   git add .
   git status
   ```
   Check that the list contains **no** `.env` file and no `atlas-credentials.env`. Delete `atlas-credentials.env` from the folder. Then:
   ```powershell
   git commit -m "English learning platform"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. Prepare these values:
   - A **new** `JWT_SECRET`: run `openssl rand -hex 32` (Git Bash) or any 64-character random string.
   - The three Atlas connection strings with the new password (`MONGO_URI_USERS`, `MONGO_URI_CONTENT`, `MONGO_URI_LEARNING`).

## 1. Security groups (EC2 -> Security Groups -> Create)

Create them in the default VPC, so the instances reach each other on private IPs.

| Group | Inbound rules |
| --- | --- |
| `sg-lb` | HTTP 80 from `0.0.0.0/0`; SSH 22 from **My IP** |
| `sg-backend` | Custom TCP **3000 from `sg-lb`** (choose the security group as the source); SSH 22 from **My IP** |

Never open ports 3001-3004. The backends are not reachable from the internet, only from the load balancer.

## 2. Launch three instances

All: Ubuntu Server 24.04 LTS, the same key pair, 20 GB storage, same region and availability zone.

| Name | Type | Security group |
| --- | --- | --- |
| `lb` | t3.micro | `sg-lb` |
| `backend-1` | t3.small | `sg-backend` |
| `backend-2` | t3.small | `sg-backend` |

The backends need 2 GB of memory to build and run five Node containers. Write down each instance's **public IP** (for SSH) and **private IP** (for the load balancer config).

## 3. Install Docker on all three

Connect from PowerShell (repeat for each instance):

```powershell
ssh -i "C:\path\to\key.pem" ubuntu@<PUBLIC-IP>
```

Then on the server:

```bash
sudo apt update && sudo apt install -y git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Connect again so the group change applies, and check `docker compose version`.

## 4. Atlas allow list

Atlas -> Network Access -> add the **public IPs of backend-1 and backend-2**. The `lb` instance never talks to the database. Remove any `0.0.0.0/0` entry once the server IPs are in.

## 5. Set up backend-1 and backend-2 (same steps on both)

```bash
git clone https://github.com/<you>/<repo>.git
cd <repo>
nano .env
```

Content of `.env` (identical on both backends, never committed):

```
JWT_SECRET=<your new secret>
CORS_ORIGIN=http://localhost:5173
MONGO_URI_USERS=mongodb+srv://<user>:<new-password>@<cluster>.mongodb.net/login?appName=Cluster0
MONGO_URI_CONTENT=mongodb+srv://<user>:<new-password>@<cluster>.mongodb.net/content?appName=Cluster0
MONGO_URI_LEARNING=mongodb+srv://<user>:<new-password>@<cluster>.mongodb.net/learning?appName=Cluster0
```

Then:

```bash
chmod 600 .env
docker compose -f docker-compose.backend.yml up -d --build
docker compose -f docker-compose.backend.yml ps
```

All five containers should become `healthy`. If one is unhealthy, run `docker compose -f docker-compose.backend.yml logs <service>`; a MongoDB connection error means the server's public IP is not yet allowed in Atlas.

Create the admin account **once** (both backends share the same database, so run it on one backend only):

```bash
docker compose -f docker-compose.backend.yml exec registration-service sh -c "ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='choose-a-strong-one' node seedAdmin.js"
```

## 6. Set up the load balancer (lb instance)

```bash
git clone https://github.com/<you>/<repo>.git
cd <repo>
nano .env
```

```
BACKEND_1=<private IP of backend-1>:3000
BACKEND_2=<private IP of backend-2>:3000
```

```bash
docker compose -f docker-compose.lb.yml up -d
docker compose -f docker-compose.lb.yml ps
curl http://localhost/lb-health
```

## 7. Test

From your computer (use the **lb public IP**):

1. `http://<LB-PUBLIC-IP>/` in the browser, then refresh several times. The page shows `servedBy` with a container ID, and the ID alternates between the two backends.
2. In Postman, use `http://<LB-PUBLIC-IP>/...` for everything: register, log in, courses, enrollments, progress (the table in README.md).
3. Check that the backends are private: `http://<BACKEND-PUBLIC-IP>:3000/health` must **not** answer (AC-21).

### Demo for the teacher

- Show the three instances in the EC2 console and the public IP of `lb` (as in your class activity).
- Show `lb/default.conf.template`: the `upstream` block with the two backends.
- Refresh the browser on the `lb` IP and point out the changing `servedBy` value.
- Failover: keep refreshing, then on backend-1 run `docker compose -f docker-compose.backend.yml stop api-gateway`. The page keeps working and shows only backend-2's ID. Bring it back with `docker compose -f docker-compose.backend.yml start api-gateway`.
- A login on one backend works on the other, because both use the same `JWT_SECRET` and database.

## 8. Update later

On each backend:

```bash
cd <repo> && git pull && docker compose -f docker-compose.backend.yml up -d --build
```

On the load balancer after changing the backend IPs in `.env`:

```bash
docker compose -f docker-compose.lb.yml up -d --force-recreate
```

## 9. Notes

- The public IP of an instance changes when it is stopped and started (the private IP does not). Attach an Elastic IP to `lb` if you want a fixed address. If a backend's public IP changes, update Atlas Network Access.
- Traffic is plain HTTP, so use test accounts only. HTTPS needs a domain and Certbot on the `lb` instance (README HRD-1).
- Rate-limit counters are kept per gateway copy, so the effective limit is per backend.
- **Stop or terminate the instances when you finish.** EC2 charges while they run.
