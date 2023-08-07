require('dotenv').config({ path: './redis.env' });
const Redis = require('ioredis');
const readline = require('readline');

const client = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    while (true) {
        console.log("\nChoisissez une option :");
        console.log("1. Afficher la liste des utilisateurs");
        console.log("2. Ajouter un utilisateur");
        console.log("3. Supprimer un utilisateur");
        console.log("4. Quitter");

        const choice = await new Promise(resolve => rl.question('Entrez votre choix : ', resolve));

        switch (choice) {
            case '1':
                const users = await client.smembers('allowedUsers');
                console.log("\nListe des utilisateurs :");
                users.forEach(user => console.log(user));
                break;

            case '2':
                const userToAdd = await new Promise(resolve => rl.question('Nom de l\'utilisateur à ajouter : ', resolve));
                await client.sadd('allowedUsers', userToAdd);
                console.log(`Utilisateur ${userToAdd} ajouté.`);
                break;

            case '3':
                const userToDelete = await new Promise(resolve => rl.question('Nom de l\'utilisateur à supprimer : ', resolve));
                await client.srem('allowedUsers', userToDelete);
                console.log(`Utilisateur ${userToDelete} supprimé.`);
                break;

            case '4':
                console.log("Au revoir!");
                rl.close();
                process.exit(0);
                break;

            default:
                console.log("Choix invalide, réessayez.");
        }
    }
}

main().catch(err => {
    console.error('Erreur:', err);
    rl.close();
});
