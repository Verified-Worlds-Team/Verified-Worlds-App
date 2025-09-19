# Verified-Worlds-App

## Elevator Pitch  
Each game world becomes part of your proof system. **Verified Worlds** allows RPG players to securely prove their in-game achievements via **XION zkTLS**, track quests, submit proofs, and showcase verified progress on leaderboards—fostering a trustworthy, collaborative community.  

---

## Project Story / About the Project  

### Inspiration  
Players often fake achievements in RPG communities, making collaboration difficult. Verified Worlds solves this by providing verifiable proof of progress, fostering authentic teamwork. Using **zkTLS** technology aligns perfectly with the hackathon’s theme of building trust through verifiable data.  

### What it does  
- Verifies in-game achievements via official data or trusted proofs  
- Displays verified progress on user profiles and leaderboards  
- Enables quest tracking, proof submission, and community collaboration  

### How we built it  
- **Frontend:** React Native + Expo  
- **Backend:** Node.js + Express  
- **Database:** PostgreSQL  
- **Verification:** XION Dave SDK + zkTLS  
- **Version Control:** GitHub  
- Deployed via **Expo Go** for live testing and demonstration  

### Challenges we ran into  
- Integrating the XION Dave SDK for mobile proof verification  
- Designing a scalable database schema connecting users, quests, proofs, and leaderboards  
- Debugging API interactions and real-time updates for a smooth user experience  

### Accomplishments we’re proud of  
- Built a working proof-of-concept demonstrating zkTLS-based verification  
- Implemented functioning leaderboard and quest tracking powered by verified data  
- Seamless integration of mobile app with blockchain verification  

### What we learned  
- **zkTLS & On-chain Proofs:** How zkTLS flows work in practice and how to store/verifiy compact cryptographic proofs on a testnet without exposing user data.  
- **Mobile + Blockchain Integration:** Best practices for integrating a blockchain verification SDK (XION Dave) into a React Native mobile app, including handling async verification flows and user feedback.  
- **Relational Data Design:** Designing a normalized PostgreSQL schema for users, quests, proofs, progress, leaderboards, and rewards — and why migrations and indexes matter for scalability.  
- **Mock-first Development:** The value of building with mocked proofs early to iterate frontend UX while backend verification is being finalized.  
- **Testing & UX:** Importance of testing on real devices (Expo Go) and designing clear UI states for "pending", "verified", and "rejected" proofs to reduce user confusion.  
- **Privacy & Security:** Balancing verifiability with user privacy — only proving necessary facts, never exposing raw account credentials.  
- **Team Workflow:** Effective task splits (DB / backend / frontend), using GitHub for collaboration, and rapidly producing a demoable MVP under time constraints.

### Next Steps  
- Expand quest types and rewards  
- Improve UX/UI and richer media for achievements  
- Integrate additional games and APIs  

---


### Project Description 
**Verified Worlds** is a mobile app that securely verifies players’ in-game achievements via official game data or trusted proof methods. Verified progress is displayed on user profiles and leaderboards, fostering a trustworthy and collaborative gaming community while rewarding genuine players.  

By eliminating fake claims, the app enables authentic teamwork and helps players find reliable teammates. The platform demonstrates the practical use of **zkTLS** for verifiable data in gaming, aligning with the hackathon’s theme of trust through verifiable information.  

### Team Information  
- **Database:** [Name], [Email], [Role]  
- **Backend:** [Name], [Email], [Role]  
- **Frontend:** [Name], [Email], [Role]  

### Tech Stack  
- React Native  
- Expo  
- Node.js  
- Express  
- PostgreSQL  
- XION Dave SDK  
- zkTLS  
- Visual Studio Code  
- GitHub  

### Problem Statement Alignment  
**Verified Worlds** addresses trust issues in online gaming communities. By leveraging **XION’s zkTLS**, players can submit proofs for in-game achievements that cannot be faked, ensuring authentic collaboration and reliable leaderboards. This builds a trustworthy community, aligning perfectly with the hackathon’s theme of verifiable data.  

### License  
MIT License  


