// Liste des captations du catalogue.
//
// Script classique séparé pour pouvoir ajouter des pièces sans toucher à la logique.
// Il transmet ses données à js/app.js par un événement plutôt que par une variable
// globale ; app.js doit donc être chargé AVANT ce fichier (voir index.html).
//
// Chaque captation a été vérifiée : intégrable, en couleur, tournée après 2000.
// - language : 'fr', 'en' ou 'autre' (autre langue ou spectacle sans paroles)
// - genre : 'comedie' (boulevard, comédie contemporaine), 'classique' (répertoire)
//   ou 'contemporain' (création contemporaine)
// - isUnofficial : mise en ligne par une chaîne sans lien avec les ayants droit,
//   susceptible d'être retirée à tout moment
// - year : renseigné uniquement lorsqu'il a pu être confirmé
(() => {
  'use strict';

  const curatedPlays = [
    {
      youtubeId: 'lgiuUY3zWfY', title: 'Îles flottantes', creator: 'Kenza Berrada, d’après Brigitte Giraud · Odéon', year: '2026', duration: '1:10:52', language: 'fr', genre: 'contemporain',
      summary: 'Un lycéen, au fil d’un exposé, finit par cesser de mentir et dire qui il est. Librement adapté du roman Jour de courage de Brigitte Giraud et créé avec une vingtaine d’adolescents dans le cadre du programme « Adolescence et territoire(s) » de l’Odéon.',
    },
    {
      youtubeId: 'kJhd3q7wZE4', title: 'Le Chant d’ivresse', creator: 'Odéon – Théâtre de l’Europe', year: '', duration: '1:32:55', language: 'fr', genre: 'contemporain',
      summary: '',
    },
    {
      youtubeId: '_BUbSJ-teQ0', title: 'Combat de nègre et de chiens', creator: 'Koltès · Cie Kobal’t, Théâtre de la Bastille', year: '2022', duration: '1:59:15', language: 'fr', genre: 'contemporain',
      summary: 'Sur un chantier en Afrique de l’Ouest, à la tombée de la nuit, Alboury vient réclamer le corps de son frère, mort sur le chantier. Face à lui : Horn, le chef de chantier, Cal, l’ingénieur, et Léone, que Horn vient de faire venir de Paris. Mise en scène de Mathieu Boisliveau.',
    },
    {
      youtubeId: '2Bxz_-9VDlc', title: 'Un sentiment de vie', creator: 'Claudine Galea · Cie Rabeux, Théâtre de la Bastille', year: '', duration: '1:15:23', language: 'fr', genre: 'contemporain',
      summary: 'Une autrice monte sur scène et trouve enfin les mots pour dire à son père, des années après sa mort, la force de son amour. Un récit traversé par les traces de la guerre d’Algérie, où la musique finit par relier le père et la fille. Mise en scène de Jean-Michel Rabeux.',
    },
    {
      youtubeId: 'eG_DjSg5HQ0', title: 'Les Derniers Jours', creator: 'Mise en scène Jean-Michel Rabeux · Cie Rabeux', year: '', duration: '1:24:02', language: 'fr', genre: 'contemporain',
      summary: '',
    },
    {
      youtubeId: 'R5lwmbQ3eQk', title: 'Comme il vous plaira', creator: 'Shakespeare · Théâtre du Nord', year: '2018', duration: '2:37:38', language: 'fr', genre: 'classique',
      summary: 'Chassée de la cour par son oncle usurpateur, Rosalinde se réfugie dans la forêt d’Arden, déguisée en jeune homme, avec sa cousine Célia. Elle y retrouve Orlando, amoureux d’elle, qui ne la reconnaît pas. Une comédie de Shakespeare sur l’amour et le travestissement.',
    },
    {
      youtubeId: 'ISzpB9gk2gg', title: 'Le Tartuffe ou l’Imposteur (lecture à la table)', creator: 'Molière · Comédie-Française', year: '', duration: '1:55:31', language: 'fr', genre: 'classique',
      summary: 'Orgon, sous l’emprise du faux dévot Tartuffe, est prêt à lui donner sa fille et ses biens. Sa femme Elmire va tendre un piège pour démasquer l’imposteur. Lecture filmée par la troupe de la Comédie-Française dans sa série « Théâtre à la table ».',
    },
    {
      youtubeId: '9pZecJzEu8U', title: 'Les Fausses Confidences (lecture à la table)', creator: 'Marivaux · Comédie-Française', year: '', duration: '1:48:12', language: 'fr', genre: 'classique',
      summary: 'Dorante, jeune homme ruiné, entre comme intendant chez la riche veuve Araminte, dont il est amoureux. Son ancien valet Dubois orchestre une série de mensonges pour qu’elle tombe amoureuse de lui. Lecture filmée par la troupe de la Comédie-Française.',
    },
    {
      youtubeId: 'Bv-YuTjXjhc', title: 'Le Menteur', creator: 'Corneille · Théâtre du Lyon', year: '', duration: '1:45:35', language: 'fr', genre: 'classique',
      summary: 'Fraîchement arrivé à Paris, le jeune Dorante s’invente exploits et aventures pour séduire, et se trompe sur le nom de la femme qu’il aime. Ses mensonges s’enchaînent jusqu’à l’emmêler complètement. Comédie de Corneille.',
    },
    {
      youtubeId: 'na-kfkhTYQI', title: 'Cyrano de Bergerac', creator: 'Rostand · Cie du Berger', year: '2012', duration: '3:12:03', language: 'fr', genre: 'classique',
      summary: 'Cyrano, poète et bretteur au nez immense, aime en secret sa cousine Roxane. Elle s’éprend du beau Christian, et Cyrano l’aide à la séduire en lui prêtant ses mots.',
    },
    {
      youtubeId: 'gekAlcby5xQ', title: 'Knock', creator: 'Jules Romains · Cie du Berger', year: '', duration: '2:17:20', language: 'fr', genre: 'classique',
      summary: 'Le docteur Knock reprend le cabinet d’un village de montagne où personne n’est jamais malade. Il entreprend de convaincre chaque habitant qu’il est un malade qui s’ignore.',
    },
    {
      youtubeId: 'mBqQv0tV6ks', title: 'Henry VI', creator: 'Shakespeare · Machine Théâtre, Odéon', year: '2009', duration: '1:29:40', language: 'fr', genre: 'classique',
      summary: 'Après la mort d’Henry V, le jeune roi Henry VI voit l’Angleterre se déchirer entre les maisons d’York et de Lancastre : c’est le début de la guerre des Deux-Roses.',
    },
    {
      youtubeId: 'V6dqwQUCrV8', title: 'Lorenzaccio', creator: 'Musset · Cie Philippe Wiart', year: '2009', duration: '1:55:42', language: 'fr', genre: 'classique',
      summary: 'Florence, 1537. Lorenzo de Médicis, compagnon de débauche du duc Alexandre, passe pour un lâche. Il prépare en secret l’assassinat du tyran.',
    },
    {
      youtubeId: '6yC3Uh9Q5j8', title: 'L’Île des esclaves', creator: 'Marivaux · Théâtre de la vallée', year: '', duration: '1:14:05', language: 'fr', genre: 'classique',
      summary: 'Après un naufrage, deux maîtres et leurs valets échouent sur une île gouvernée par d’anciens esclaves. La loi de l’île les oblige à échanger leurs rôles.',
    },
    {
      youtubeId: '6Z2wTrQXoW4', title: 'Le Misanthrope à tout prix', creator: 'Cie du Plateau Libre', year: '', duration: '1:15:11', language: 'fr', genre: 'comedie',
      summary: '',
    },
    {
      youtubeId: '6GZksuQggng', title: 'Le Mont Analogue', creator: 'D’après René Daumal · Temps Blancs', year: '', duration: '1:27:14', language: 'fr', genre: 'contemporain',
      summary: 'D’après le roman inachevé de René Daumal : une petite expédition part à la recherche d’une montagne invisible qui relierait la Terre au Ciel.',
    },
    {
      youtubeId: 'IMs6bi0J-fA', title: 'L’Espèce humaine ou l’Inimaginable', creator: 'D’après Robert Antelme · Théâtre Amer', year: '', duration: '1:17:44', language: 'fr', genre: 'contemporain',
      summary: 'D’après le récit de Robert Antelme, résistant déporté en 1944, sur sa détention dans un camp de travail nazi et sur ce qui reste d’humain quand tout est fait pour le nier.',
    },
    {
      youtubeId: 'TsboxpFnPrE', title: 'My Story', creator: 'Céline Ohrel · Cie Diplex', year: '', duration: '1:34:44', language: 'fr', genre: 'contemporain',
      summary: '',
    },
    {
      youtubeId: '6XSZpF525Y0', title: 'Le Roi Lear', creator: 'Shakespeare · Mathieu Coblentz, Théâtre Amer', year: '2025', duration: '2:14:32', language: 'fr', genre: 'classique',
      summary: 'Le vieux roi Lear veut abandonner le pouvoir et partager son royaume entre ses filles, à condition qu’elles lui déclarent publiquement leur amour. Une version épique, entre faste baroque et cabaret glam rock, avec sept comédiens-musiciens. Jouée au Théâtre du Soleil.',
    },
    {
      youtubeId: '3uc_JSJPTgU', title: 'La Mouette', creator: 'Tchekhov · Cie Kobal’t', year: '', duration: '1:46:41', language: 'fr', genre: 'classique',
      summary: 'Dans une propriété à la campagne, le jeune Treplev fait jouer sa pièce d’avant-garde par Nina, dont il est amoureux. Mais Nina rêve de gloire et se tourne vers Trigorine, écrivain célèbre et amant de la mère de Treplev.',
    },
    {
      youtubeId: '1-W0HpdMVvM', title: 'Britannicus', creator: 'Racine · Cie du Berger', year: '2024', duration: '2:20:32', language: 'fr', genre: 'classique',
      summary: 'Le jeune empereur Néron fait enlever Junie, promise à son demi-frère Britannicus, et cherche à s’affranchir de sa mère Agrippine. La naissance d’un tyran.',
    },
    {
      youtubeId: 'XjAWavSmbkg', title: 'L’École des femmes', creator: 'Molière · Jean-Marc Chotteau, La Virgule', year: '', duration: '2:10:59', language: 'fr', genre: 'classique',
      summary: 'Arnolphe a fait élever Agnès dans l’ignorance pour l’épouser sans risque d’être trompé. Mais elle tombe amoureuse du jeune Horace, qui fait d’Arnolphe son confident sans savoir qui il est.',
    },
    {
      youtubeId: 'tZ5Pl6Kso0U', title: 'Le Bourgeois gentilhomme', creator: 'Molière et Lully · Opéra Royal de Versailles', year: '', duration: '2:45:20', language: 'fr', genre: 'classique',
      summary: 'Monsieur Jourdain, riche bourgeois, veut à tout prix devenir gentilhomme : leçons de danse, de musique, d’escrime et de philosophie, jusqu’à une cérémonie turque grotesque. Comédie-ballet avec la musique de Lully.',
    },
    {
      youtubeId: 'RDoEtysSBqY', title: 'Les Amants magnifiques', creator: 'Molière et Lully · Les Malins Plaisirs', year: '', duration: '2:35:52', language: 'fr', genre: 'classique',
      summary: 'En Thessalie, deux princes rivalisent de fêtes somptueuses pour obtenir la main de la princesse Ériphile, qui aime en secret Sostrate, un simple général. Comédie-ballet mise en scène par Vincent Tavernier.',
    },
    {
      youtubeId: 'ekAG1dgCCYQ', title: 'Le Dindon', creator: 'Feydeau · Cie du Berger', year: '', duration: '3:07:04', language: 'fr', genre: 'classique',
      summary: 'Lucienne, épouse fidèle de Vatelin, a juré de le tromper le jour où il la tromperait. Deux séducteurs, Pontagnac et Rédillon, guettent ce moment. Vaudeville de Feydeau.',
    },
    {
      youtubeId: '_9WXMdlV4tI', title: 'Le Dindon', creator: 'Feydeau · La Comédie des Ternes', year: '', duration: '2:19:26', language: 'fr', genre: 'classique',
      summary: 'Lucienne, épouse fidèle de Vatelin, a juré de le tromper le jour où il la tromperait. Deux séducteurs, Pontagnac et Rédillon, guettent ce moment. Vaudeville de Feydeau.',
    },
    {
      youtubeId: 'VBzB7cuQZvM', title: 'La Dispute', creator: 'Marivaux · Théâtre Olympia, CDN de Tours', year: '', duration: '1:05:48', language: 'fr', genre: 'classique',
      summary: 'Qui, de l’homme ou de la femme, a été infidèle le premier ? Pour trancher, un prince et sa maîtresse observent quatre jeunes gens élevés à l’écart du monde, qui se rencontrent pour la première fois.',
    },
    {
      youtubeId: 'pcgyT_cPyvQ', title: 'La Cantatrice chauve', creator: 'Ionesco · Cie de la Toque Flamboyante', year: '2026', duration: '1:09:06', language: 'fr', genre: 'classique',
      summary: 'Dans un salon anglais, les Smith reçoivent les Martin. Leurs banalités dérapent peu à peu vers l’absurde le plus complet. La pièce fondatrice du théâtre de l’absurde.',
    },
    {
      youtubeId: '7c6ehafEvyg', title: 'En attendant Godot', creator: 'Beckett · Écailles Productions', year: '', duration: '2:31:13', language: 'fr', genre: 'classique',
      summary: 'Au bord d’une route, près d’un arbre, Vladimir et Estragon attendent un certain Godot, qui ne vient jamais.',
    },
    {
      youtubeId: '9_Dm6tje-eg', title: 'Je suis encore en vie', creator: 'Jacques Allaire · Le Tarmac', year: '2014', duration: '58:59', language: 'fr', genre: 'contemporain',
      summary: 'Un spectacle presque sans paroles, porté par les corps : une femme sous l’autorité masculine, sous l’ombre de la poétesse afghane Nadia Anjuman, tuée par son mari. Avec Anissa Daoud et Jacques Allaire.',
    },
    {
      youtubeId: '8M1UvkqVQrM', title: 'Huit minutes-lumière', creator: 'Compagnie Inachevée', year: '2022', duration: '2:08:21', language: 'fr', genre: 'contemporain',
      summary: '',
    },
    {
      youtubeId: '7912YrR9Pw4', title: 'Chère Amazone', creator: 'Compagnie en Amazone', year: '2015', duration: '1:06:38', language: 'fr', genre: 'contemporain',
      summary: '',
    },
    {
      youtubeId: '1OU0cuGuPSk', title: 'Macbeth – 1re partie (EN)', creator: 'Shakespeare · Teller et Aaron Posner, Folger Theatre', year: '2008', duration: '1:09:39', language: 'en', genre: 'classique',
      summary: 'Poussé par la prophétie de trois sorcières et par l’ambition de sa femme, le général Macbeth assassine le roi Duncan pour prendre sa place. Mise en scène du magicien Teller et d’Aaron Posner, avec des effets d’illusion. En anglais.',
    },
    {
      youtubeId: 'GLc3w-yp3wk', title: 'Macbeth – 2e partie (EN)', creator: 'Shakespeare · Teller et Aaron Posner, Folger Theatre', year: '2008', duration: '54:40', language: 'en', genre: 'classique',
      summary: 'Suite et fin : devenu roi, Macbeth s’enfonce dans le crime et la paranoïa. En anglais.',
    },
    {
      youtubeId: 'wBWsaO7wgnQ', title: 'The Tempest (EN)', creator: 'Shakespeare · The Lord Chamberlain’s Men', year: '2018', duration: '1:56:28', language: 'en', genre: 'classique',
      summary: 'Prospero, duc de Milan détrôné et exilé sur une île avec sa fille Miranda, déclenche une tempête pour faire échouer ses ennemis sur son rivage. En anglais.',
    },
    {
      youtubeId: 'aAzvnV4Qz9w', title: 'Missing (théâtre physique)', creator: 'Gecko', year: '2012', duration: '1:05:03', language: 'autre', genre: 'contemporain',
      summary: 'Spectacle de théâtre physique de la compagnie britannique Gecko : peu de dialogues, une histoire portée par le mouvement, la lumière et la musique.',
    },
    {
      youtubeId: 'YSvS9y1WjrE', title: 'The Overcoat (théâtre physique)', creator: 'Gecko', year: '', duration: '1:19:38', language: 'autre', genre: 'contemporain',
      summary: 'D’après la nouvelle de Gogol : un modeste employé de bureau voit sa vie bouleversée par un nouveau manteau. Théâtre physique, quasiment sans paroles.',
    },
    {
      youtubeId: 'yRr9otK7_Ac', title: 'The Race (théâtre physique)', creator: 'Gecko', year: '', duration: '1:02:27', language: 'autre', genre: 'contemporain',
      summary: 'Spectacle de théâtre physique de la compagnie britannique Gecko, porté par le mouvement et la musique plutôt que par le texte.',
    },
    {
      youtubeId: 'kHebeOH129c', title: 'Hibernatus', creator: 'Jean-Bernard Luc · avec Jean-Luc Reichmann, Ingrid Chauvin', year: '2015', duration: '1:31:18', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: 'Un homme congelé dans les glaces du pôle Nord au début du XXe siècle est ramené à la vie de nos jours. Pour lui éviter un choc fatal, sa famille doit lui faire croire qu’on est toujours en 1905.',
    },
    {
      youtubeId: '5MWoRY9ZAG0', title: 'Le Gai Mariage', creator: 'Avec Laurent Ournac, Olivier Sitruk', year: '', duration: '1:52:01', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: '',
    },
    {
      youtubeId: 'zAvVRGzpEDA', title: 'Les Belles-Sœurs', creator: 'Éric Assous', year: '', duration: '1:36:33', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: '',
    },
    {
      youtubeId: 'xyBIJwFiAmQ', title: 'Les Bonobos', creator: 'Laurent Baffie', year: '', duration: '1:49:15', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: '',
    },
    {
      youtubeId: 'Ltea52zfd0Y', title: 'La Vérité', creator: 'Florian Zeller · avec Pierre Arditi', year: '2011', duration: '1:43:54', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: 'Michel a une liaison avec Alice, la femme de son meilleur ami Paul. Menteur maladroit, il s’emmêle dans ses mensonges… et découvre qu’il n’est peut-être pas le seul à mentir.',
    },
    {
      youtubeId: 'o9V2Jg-poRs', title: 'Comme s’il en pleuvait', creator: 'Sébastien Thiéry · avec Pierre Arditi, Évelyne Bouix', year: '2014', duration: '1:25:40', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: 'Un couple découvre chaque jour des billets de banque qui apparaissent mystérieusement dans son appartement. D’où vient cet argent, et qui le dépose ?',
    },
    {
      youtubeId: 'smhwtfWD-EE', title: '13 à table', creator: 'Marc-Gilbert Sauvageon', year: '2020', duration: '1:52:31', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: 'Le soir du réveillon de Noël, Madeleine, très superstitieuse, s’aperçoit qu’ils vont être treize à table. Il faut à tout prix trouver un quatorzième convive.',
    },
    {
      youtubeId: 'Uf_eZW3Z0Pw', title: 'Ils se sont aimés', creator: 'Pierre Palmade, Muriel Robin · avec Pierre Palmade, Michèle Laroque', year: '2002', duration: '1:28:01', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: 'Une suite de scènes de la vie d’un couple, de la rencontre aux disputes et à la séparation, jouée par Pierre Palmade et Michèle Laroque.',
    },
    {
      youtubeId: 'g1eJKQSMIbM', title: 'L’Invitation', creator: 'Théâtre de la Madeleine · avec Gad Elmaleh', year: '2020', duration: '1:34:45', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: '',
    },
    {
      youtubeId: 'aohtKoYbevo', title: 'Espèces menacées', creator: 'Ray Cooney · avec Gérard Jugnot, Martin Lamotte', year: '', duration: '1:40:54', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: 'Un comptable sans histoire récupère par erreur une mallette remplie de billets et décide de partir à l’étranger le soir même de son anniversaire. Farce de Ray Cooney.',
    },
    {
      youtubeId: 'XiEyd4L1VmA', title: 'C’était quand la dernière fois ?', creator: 'Théâtre Tristan Bernard · avec Virginie Hocq, Zinedine Soualem', year: '2018', duration: '1:35:52', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: '',
    },
    {
      youtubeId: 'axpmHfdoU5I', title: 'Je préfère qu’on reste amis', creator: 'Laurent Ruquier · avec Michèle Bernier, Frédéric Diefenthal', year: '2016', duration: '1:59:04', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: 'Claudine est amoureuse depuis longtemps de son meilleur ami Valentin, qui ne la voit que comme une amie. Comédie de Laurent Ruquier.',
    },
    {
      youtubeId: 'DbTbFmXRH9s', title: 'Madame Doubtfire', creator: 'Avec Michel Leeb', year: '', duration: '1:47:43', language: 'fr', genre: 'comedie', isUnofficial: true,
      summary: 'Un père divorcé, privé de ses enfants, se déguise en vieille gouvernante pour pouvoir les voir chaque jour.',
    },
    {
      youtubeId: 'WlAGpyw4eEc', title: 'L’Hôtel du libre échange', creator: 'Feydeau · diffusé sur France 2', year: '2015', duration: '2:27:33', language: 'fr', genre: 'classique', isUnofficial: true,
      summary: 'Pinglet donne rendez-vous à Marcelle, la femme de son ami Paillardin, dans un hôtel douteux. Le même soir, tout leur entourage s’y retrouve. Vaudeville de Feydeau.',
    },
    {
      youtubeId: 'TNvDKIANsLo', title: 'Le Malade imaginaire', creator: 'Molière · Comédie-Française, mise en scène Claude Stratz', year: '2001', duration: '2:01:17', language: 'fr', genre: 'classique', isUnofficial: true,
      summary: 'Argan, hypocondriaque, veut marier sa fille Angélique à un médecin pour être soigné à domicile. Mais Angélique aime Cléante, et la servante Toinette va tout faire pour les aider.',
    },
    {
      youtubeId: '1yN2o8nJMOo', title: 'Dom Juan ou le Festin de pierre', creator: 'Molière · Comédie-Française', year: '2002', duration: '2:18:50', language: 'fr', genre: 'classique', isUnofficial: true,
      summary: 'Dom Juan, séducteur libertin, enchaîne les conquêtes et défie toutes les règles, humaines comme divines, jusqu’à inviter à dîner la statue d’un homme qu’il a tué.',
    },
    {
      youtubeId: 'mlMnz9B-Zho', title: 'Le Misanthrope', creator: 'Molière · Comédie-Française, mise en scène Jean-Pierre Miquel', year: '2000', duration: '2:15:10', language: 'fr', genre: 'classique', isUnofficial: true,
      summary: 'Alceste déteste l’hypocrisie mondaine et veut dire la vérité à tout le monde. Il est pourtant amoureux de Célimène, jeune veuve coquette qui adore la vie de salon.',
    },
    {
      youtubeId: 'smoT72cbpRo', title: 'Le Mariage de Figaro', creator: 'Beaumarchais', year: '', duration: '2:11:39', language: 'fr', genre: 'classique', isUnofficial: true,
      summary: 'Le jour de son mariage avec Suzanne, Figaro découvre que son maître, le comte Almaviva, veut séduire sa fiancée. Une folle journée de ruses et de quiproquos.',
    },
    {
      youtubeId: '2qsVJN0C0GE', title: 'L’Avare', creator: 'Molière', year: '', duration: '1:59:40', language: 'fr', genre: 'classique', isUnofficial: true,
      summary: 'Harpagon, vieillard obsédé par son argent, veut marier ses enfants pour son profit et épouser lui-même la jeune Mariane, aimée de son fils Cléante.',
    },
    {
      youtubeId: 'Kb_voCqu250', title: 'Hamlet', creator: 'Shakespeare', year: '', duration: '2:09:08', language: 'fr', genre: 'classique', isUnofficial: true,
      summary: 'Le spectre de son père apprend au prince Hamlet qu’il a été assassiné par son frère Claudius, devenu roi et mari de sa mère. Hamlet feint la folie pour préparer sa vengeance.',
    },
    {
      youtubeId: 'jzFrnFP--RA', title: 'Macbeth (EN)', creator: 'Shakespeare · Stratford Festival', year: '2017', duration: '2:17:00', language: 'en', genre: 'classique', isUnofficial: true,
      summary: 'Poussé par la prophétie de trois sorcières et par l’ambition de sa femme, le général Macbeth assassine le roi Duncan pour prendre sa place. En anglais.',
    },
    {
      youtubeId: 'QKoIJP8QgiM', title: 'Hamlet (EN)', creator: 'Shakespeare · Stratford Festival', year: '2016', duration: '2:45:32', language: 'en', genre: 'classique', isUnofficial: true,
      summary: 'Le spectre de son père apprend au prince Hamlet qu’il a été assassiné par son frère Claudius, devenu roi. Hamlet feint la folie pour préparer sa vengeance. En anglais.',
    },
    {
      youtubeId: 'TcKPpOr7_gU', title: 'Othello (EN)', creator: 'Shakespeare · Stratford Festival', year: '2019', duration: '2:40:24', language: 'en', genre: 'classique', isUnofficial: true,
      summary: 'Le général Othello, manipulé par son enseigne Iago, finit par croire que sa femme Desdémone le trompe. En anglais.',
    },
    {
      youtubeId: 'l8JO39fuFfc', title: 'The Tempest (EN)', creator: 'Shakespeare · Stratford Festival', year: '2019', duration: '2:23:41', language: 'en', genre: 'classique', isUnofficial: true,
      summary: 'Prospero, duc de Milan détrôné et exilé sur une île avec sa fille Miranda, déclenche une tempête pour faire échouer ses ennemis sur son rivage. En anglais.',
    },
    {
      youtubeId: 'ztAhKXhnxvM', title: 'Much Ado About Nothing (EN)', creator: 'Shakespeare · Stratford Festival', year: '2023', duration: '2:37:24', language: 'en', genre: 'classique', isUnofficial: true,
      summary: 'Béatrice et Bénédict passent leur temps à se disputer, pendant que Claudio et Héro s’apprêtent à se marier. Leurs amis vont s’amuser à les rapprocher. En anglais.',
    },
    {
      youtubeId: 'UKcc96ua8XY', title: 'Le Marchand de Venise (en hébreu)', creator: 'Shakespeare · Habima, mise en scène Ilan Ronen, Shakespeare’s Globe', year: '2012', duration: '2:15:14', language: 'autre', genre: 'classique', isUnofficial: true,
      summary: 'Pour aider son ami Bassanio, le marchand Antonio emprunte de l’argent à l’usurier Shylock, qui exige une livre de sa chair en garantie. Version du théâtre national israélien Habima, jouée au Globe de Londres.',
    },
    {
      youtubeId: '3ZrL6HciBUc', title: 'The Importance of Being Earnest (EN)', creator: 'Oscar Wilde · Roundabout Theatre, Broadway', year: '2011', duration: '2:10:26', language: 'en', genre: 'classique', isUnofficial: true,
      summary: 'Deux jeunes dandys s’inventent chacun un double nommé Ernest pour échapper à leurs obligations, jusqu’à ce que leurs mensonges se croisent. En anglais.',
    },
  ];

  document.dispatchEvent(new CustomEvent('rideau:curated-plays', { detail: Object.freeze(curatedPlays) }));
})();
