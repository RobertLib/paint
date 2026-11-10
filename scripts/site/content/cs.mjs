/* ==========================================================================
   Czech copy for the landing pages. Keys of `pages` are the page ids from
   ../pages.mjs; the structure follows the content brief.
   ========================================================================== */

export default {
  ui: {
    navEditor: "Otevřít editor",
    navTools: "Všechny nástroje",
    navMain: "Hlavní",
    breadcrumbLabel: "Drobečková navigace",
    ogImageAlt: "Paint Studio – editor obrázků v prohlížeči. Vrstvy, retuš, filtry.",
    dropTitle: "Přetáhněte sem obrázek",
    dropButton: "Vybrat obrázek",
    dropHint: "nebo ho vložte ze schránky (Ctrl+V) · PNG, JPG, WebP, HEIC, PSD…",
    dropBusy: "Editor se otevírá…",
    dropUnsupported:
      "Tento soubor tu otevřít nejde. Vyberte obrázek (PNG, JPG, WebP, HEIC…), soubor PSD nebo projekt .paint.",
    blankButton: "Začít s prázdným plátnem",
    trust: ["Nic se nenahrává", "Bez registrace", "Bez vodoznaku"],
    stepsTitle: "Jak na to",
    faqTitle: "Časté dotazy",
    relatedTitle: "Související nástroje",
    allToolsTitle: "Všechny nástroje",
    footerText:
      "Paint Studio je zdarma a má otevřený zdrojový kód pod licencí MIT. Všechno běží přímo ve vašem prohlížeči, obrázky nikam neodcházejí.",
    footerSource: "Zdrojový kód na GitHubu",
    languageLabel: "Jazyk",
    homeLink: "Paint Studio",
    notFoundTitle: "Stránka nenalezena",
    notFoundText:
      "Tahle stránka neexistuje, nebo byla přesunuta. Editor i všechny nástroje ale fungují dál.",
    notFoundBack: "Zpět na úvodní stránku",
  },

  home: {
    title: "Paint Studio – úprava fotek online zdarma",
    description:
      "Editor obrázků v prohlížeči: vrstvy, štětce, retuš, korekce, filtry a export do PNG, JPG, WebP i PSD. Zdarma, bez registrace a bez nahrávání fotek na server.",
    h1: "Úprava fotek online zdarma, přímo v prohlížeči",
    lead:
      "Paint Studio je plnohodnotný editor obrázků s vrstvami, výběry, retušovacími nástroji a korekcemi, který celý běží ve vašem prohlížeči. Nic neinstalujete, nezakládáte účet a fotky se nikam nenahrávají – každá úprava se počítá přímo ve vašem počítači, tabletu nebo telefonu.",
    features: [
      {
        h2: "Vrstvy, masky a režimy prolnutí",
        p: "Skládejte obrázek z libovolného počtu vrstev jako v desktopovém editoru. V panelu Vrstvy je přejmenujete, zamknete, skryjete, nastavíte jim krytí a přetažením změníte jejich pořadí. Sedmnáct režimů prolnutí pomáhá se stíny, světly i barevným tónováním. Maska vrstvy skryje část obrazu bez mazání: černou barvou skrýváte, bílou zase odkrýváte. Hotovou vrstvu spojíte s vrstvou pod ní příkazem Sloučit dolů, celý dokument příkazem Sloučit do jedné vrstvy.",
      },
      {
        h2: "Výběry, které hlídají každý zásah",
        p: "Obdélníkový výběr, Eliptický výběr, Laso a Kouzelná hůlka vymezí oblast, se kterou chcete pracovat. Výběr můžete vytvořit nový, přidat k němu, odečíst z něj nebo ponechat jen průnik, nastavit mu prolnutí okraje a invertovat ho. Malování, výplň, mazání, korekce i filtry se pak zastaví přesně na jeho hranici. Zesvětlíte tak jen oblohu nebo rozmažete jediný obličej, aniž byste museli složitě stavět masku.",
      },
      {
        h2: "Štětce, tvary a text",
        p: "Štětec má nastavitelnou velikost, krytí, tvrdost i vyhlazení tahu a reaguje na přítlak pera. Vedle něj jsou tu nástroje Tužka pro ostré pixelové čáry, Sprej, Guma, Výplň s nastavitelnou tolerancí a Přechod, lineární i kruhový. Pro přesnou práci slouží Čára a Šipka s nastavitelnou tloušťkou a tvary Obdélník se zaoblenými rohy, Elipsa, Mnohoúhelník a Hvězda, které kreslíte obrysem, výplní nebo obojím. Nástroj Text píše rovnou na plátno ve výsledném písmu a textové vrstvy zůstávají upravitelné.",
      },
      {
        h2: "Retuš drobných vad",
        p: "Bodová retuš odstraní smítko, pupínek nebo tenký drát jediným tahem: po puštění tlačítka se místo vyplní strukturou z okolí. Retušovací štětec kopíruje texturu z místa, které si sami zvolíte, ale zachová barvu a jas cíle. Razítko kopíruje přesně. Zesvětlit / ztmavit pracuje zvlášť se stíny, středními tóny a světly. Doplňují je nástroje Rozmazání, Zaostření a Rozmazání prstem. Všechny respektují aktivní vrstvu i výběr.",
      },
      {
        h2: "Korekce a filtry s živým náhledem",
        p: "Panel Korekce nabízí 15 posuvníků: expozici, jas, kontrast, světla, stíny, gamu, sytost, živost, teplotu, nádech, posun odstínu, zřetelnost, změkčení, zrno a vinětaci. Každou změnu hned vidíte na fotce. Pro přesnou práci s tóny jsou tu Úrovně… s histogramem a Křivky… pro jednotlivé kanály. Panel Filtry obsahuje 21 filtrů, například Odstíny šedi, Sépie, Vintage, Duotón nebo Kresba tužkou, každý s náhledem přímo z vaší fotky.",
      },
      {
        h2: "Ořez, velikost a otáčení",
        p: "Nástroj Oříznutí nabízí poměry stran 1:1, 4:3, 16:9 a další spolu s mřížkou podle pravidla třetin. Velikost obrázku… mění rozlišení v pixelech, Velikost plátna… přidá nebo ubere místo kolem obrazu s volbou ukotvení. Obrázek otočíte o 90° nebo 180°, překlopíte vodorovně či svisle a nástrojem Transformace ho volně posunete, zvětšíte nebo natočíte o libovolný úhel. Příkaz Oříznout průhledné okraje odstraní prázdné místo kolem objektu jedním kliknutím.",
      },
      {
        h2: "Od fotek z iPhonu po soubory PSD",
        p: "Otevřete PNG, JPEG, WebP, GIF (jen první snímek), SVG, BMP, AVIF (pokud ho prohlížeč umí dekódovat), fotky z iPhonu ve formátu HEIC i soubory PSD z Photoshopu včetně vrstev. Obrázek stačí přetáhnout do okna, vybrat z disku nebo vložit ze schránky klávesami <kbd>Ctrl</kbd>+<kbd>V</kbd>. Exportovat můžete do PNG, JPEG a WebP s volbou kvality a měřítka a s odhadem velikosti souboru ještě před stažením, nebo do vrstveného PSD. Rozpracovanou práci uložíte jako projekt <code>.paint</code>.",
      },
      {
        h2: "Soukromí, offline a automatické ukládání",
        p: "Paint Studio nemá žádný server, na který by se obrázky posílaly. Fotka se načte do plátna ve vaší záložce a všechny operace proběhnou na vašem zařízení, proto je editor vhodný i pro doklady, snímky obrazovky nebo rodinné fotky. Po první návštěvě funguje i bez připojení a dá se nainstalovat jako aplikace (PWA). Rozpracovaný obrázek se průběžně ukládá do úložiště prohlížeče a při další návštěvě vám ho editor nabídne k obnovení.",
      },
    ],
    faq: [
      {
        q: "Nahrávají se moje fotky někam?",
        a: "Ne. Paint Studio nemá serverovou část. Obrázek se načte do plátna přímo ve vaší záložce prohlížeče a každá úprava proběhne na vašem zařízení, nic se neodesílá ani neukládá jinde. Jedinou výjimkou je dekodér formátu HEIC: mimo Safari si ho prohlížeč při prvním použití jednou stáhne z CDN jsDelivr. Samotná fotka ale zůstává u vás.",
      },
      {
        q: "Je Paint Studio opravdu zdarma?",
        a: "Ano, úplně. Nepotřebujete účet, editor nemá zkušební dobu, nezobrazuje reklamy a na exportované obrázky nepřidává vodoznak. Žádná funkce není schovaná za placením. Projekt má otevřený zdrojový kód pod licencí MIT, takže si ho můžete prohlédnout na GitHubu, nebo si ho dokonce upravit podle sebe.",
      },
      {
        q: "Funguje editor bez internetu?",
        a: "Po první návštěvě ano. Aplikace se uloží do mezipaměti prohlížeče, takže se načte i bez připojení, a můžete si ji nainstalovat na plochu nebo do docku jako aplikaci (PWA). Rozpracovaný obrázek se průběžně ukládá do úložiště prohlížeče a při dalším otevření vám ho editor nabídne k obnovení. Výjimkou jsou velmi velké dokumenty: když všechny vrstvy dohromady přesáhnou zhruba 192 megapixelů (třeba deset vrstev 24megapixelové fotky), automatické ukládání se vynechá – takovou práci si proto ukládejte jako projekt <code>.paint</code>.",
      },
      {
        q: "Dá se používat na mobilu nebo tabletu?",
        a: "Ano. Rozhraní se přizpůsobí malé obrazovce, plátno reaguje na dotyk i stylus a přiblížíte ho roztažením dvou prstů. Na tabletu s perem se kreslí pohodlně včetně citlivosti na přítlak. Na telefonu se hodí spíš rychlé ořezy, korekce a filtry než detailní retuš.",
      },
      {
        q: "Jak velký obrázek editor zvládne?",
        a: "Na počítači může mít dokument až 8000 × 8000 pixelů. Velikost plátna navíc omezuje prohlížeč – Safari na iPhonu a iPadu zvládne nejvýš zhruba 16,7 megapixelu. Větší obrázky editor při otevření zmenší tak, aby se do limitu vešly. Jak svižně se s velkou fotkou a mnoha vrstvami pracuje, pak závisí hlavně na výkonu a paměti vašeho zařízení.",
      },
      {
        q: "Co Paint Studio neumí?",
        a: "Nemá funkce umělé inteligence, takže sám nevybere objekt ani nevygeneruje chybějící část obrazu. Nepracuje s CMYK, správou barev ani formátem RAW, barvy upravuje v 8 bitech na kanál (16bitové a 32bitové PSD při otevření převede), neupravuje animované GIFy, není to vektorový editor a neotevře PSB. Obrázky upravujete jeden po druhém, hromadné zpracování nenabízí.",
      },
      {
        q: "Jaké má klávesové zkratky?",
        a: "Zkratky odpovídají zvyklostem z jiných editorů: jednotlivé klávesy přepínají nástroje, <kbd>Ctrl</kbd>+<kbd>Z</kbd> vrací krok zpět (až 80 kroků, u velkých fotek méně), mezerník s tažením posouvá plátno a kolečko myši přibližuje až na 3200 %. Kompletní přehled zobrazíte v editoru klávesou <kbd>?</kbd>. K dispozici je také tmavý a světlý motiv, který se řídí nastavením systému, dokud si ho sami nezvolíte.",
      },
      {
        q: "Je editor v češtině?",
        a: "Ano. Rozhraní editoru je k dispozici v češtině i v angličtině. Názvy nástrojů a nabídek na těchto stránkách odpovídají tomu, co uvidíte v editoru – například nabídka Obrázek, panel Korekce nebo dialog „Exportovat obrázek“ s tlačítkem Stáhnout.",
      },
    ],
  },

  pages: {
    /* ------------------------------------------------------------------ */
    "crop-image": {
      title: "Oříznout fotku online zdarma",
      description:
        "Oříznout fotku online zdarma a bez nahrávání na server: volný ořez nebo poměr 1:1, 4:3, 16:9 či 9:16, mřížka třetin a export do JPG, PNG nebo WebP.",
      h1: "Oříznout fotku online",
      lead:
        "Přetáhněte fotku sem a editor se otevře s rámečkem ořezu připraveným nad obrázkem. Zvolte poměr stran, posuňte rámeček a ořez potvrďte klávesou <kbd>Enter</kbd>.",
      card: "Oříznout fotku",
      cardText: "Ořez s poměry stran 1:1, 4:3, 16:9 a mřížkou třetin",
      steps: [
        "Přetáhněte fotku do pole výše, nebo ji vyberte z disku.",
        "Zvolte poměr stran a tažením okrajů či rohů upravte rámeček.",
        "Ořez potvrďte klávesou <kbd>Enter</kbd> nebo tlačítkem Použít a klikněte na Exportovat.",
      ],
      sections: [
        {
          h2: "Jaký poměr stran zvolit",
          p: "Čtverec 1:1 se hodí na profilovou fotku a příspěvky na sociální sítě. Poměr 16:9 odpovídá obrazovce notebooku, televizi i náhledu videa, 9:16 je formát na výšku pro stories a krátká videa. Většina fotoaparátů fotí v poměru 3:2, většina telefonů ve 4:3 – v těchto poměrech tedy oříznete fotku, aniž by se změnil její tvar. Poměr 3:4 je totéž na výšku. Volný ořez použijte, když chcete jen odstranit rušivý okraj a na přesném rozměru nezáleží.",
        },
        {
          h2: "Kompozice podle pravidla třetin",
          p: "Při úpravě rámečku se zobrazí mřížka, která obraz dělí na třetiny. Hlavní motiv – oči na portrétu, maják nebo osamělý strom – umístěte na některý z průsečíků čar a horizont na horní či dolní vodorovnou linku místo doprostřed. Fotka tak působí vyváženěji a živěji. Rámeček můžete uchopit uprostřed a posouvat ho, aniž by se měnila jeho velikost. Je-li fotka nakřivo, nejdřív ji srovnejte volným otočením a teprve potom ořízněte, jinak by v rozích zůstala prázdná místa.",
        },
        {
          h2: "Ořez neubírá kvalitu, jen plochu",
          p: "Oříznutím se zbylé pixely nijak nepřepočítávají ani nerozmazávají, obrázek jen přijde o část plochy. Silný ořez malé fotky ale znamená málo pixelů – na displeji to nevadí, při tisku už ano. O kvalitě výsledného souboru rozhoduje až export: JPEG se hodí pro fotky, PNG pro snímky obrazovky a grafiku s ostrými hranami. Pokud jste ořízli víc, než jste chtěli, vraťte krok zpět klávesami <kbd>Ctrl</kbd>+<kbd>Z</kbd> a rámeček nastavte znovu.",
        },
      ],
      faq: [
        {
          q: "Jak oříznout fotku do čtverce?",
          a: "V liště nástroje Oříznutí zvolte poměr 1:1. Rámeček se změní na čtverec, který zvětšíte tažením za roh a posunete tam, kde má být střed fotky. Ořez potvrďte klávesou <kbd>Enter</kbd> a obrázek stáhněte přes tlačítko Exportovat.",
        },
        {
          q: "Můžu oříznout obrázek podle výběru?",
          a: "Ano. Označte oblast nástrojem Obdélníkový výběr nebo jiným výběrem a v nabídce Obrázek zvolte Oříznout podle výběru. Plátno se zmenší přesně na ohraničení výběru. Hodí se to, když už výběr máte hotový z předchozí úpravy.",
        },
        {
          q: "Oříznu fotku i na mobilu?",
          a: "Ano, editor funguje i v mobilním prohlížeči. Rámeček ořezu posouváte a zvětšujete prstem, obrázek přiblížíte roztažením dvou prstů. Fotka se ani na telefonu nikam neodesílá, ořez proběhne přímo v zařízení.",
        },
        {
          q: "V jakém formátu oříznutou fotku uložit?",
          a: "Pro fotky zvolte v dialogu „Exportovat obrázek“ formát JPEG s kvalitou kolem 80–90, pro snímky obrazovky a grafiku PNG. WebP dává při podobné kvalitě menší soubory a hodí se na web. Odhad velikosti souboru uvidíte ještě před kliknutím na Stáhnout.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "resize-image": {
      title: "Změnit velikost obrázku a zmenšit fotku",
      description:
        "Změňte velikost obrázku nebo zmenšete fotku na přesný počet pixelů. Šířka, výška, zachování poměru stran a export do JPG, PNG či WebP, zdarma a bez nahrávání.",
      h1: "Změnit velikost obrázku online",
      lead:
        "Zadejte novou šířku nebo výšku v pixelech a fotku zmenšíte či zvětšíte bez deformace. Dialog Velikost obrázku… se otevře hned po načtení fotky.",
      card: "Změnit velikost",
      cardText: "Šířka a výška v pixelech se zachováním poměru stran",
      steps: [
        "Přetáhněte fotku sem, nebo ji vyberte z disku.",
        "V dialogu Velikost obrázku… zadejte šířku nebo výšku v pixelech.",
        "Změnu potvrďte, klikněte na Exportovat a obrázek stáhněte.",
      ],
      sections: [
        {
          h2: "Jaké rozměry zvolit",
          p: "Pro e-mail nebo chat bohatě stačí delší strana 1600–2000 px: fotka vypadá dobře na každém displeji a nemá desítky megabajtů. Na web a do e-shopu se obvykle používá 1200–2000 px podle šablony, náhledové obrázky bývají kolem 400–800 px a profilová fotka potřebuje jen pár set pixelů. Pro tisk počítejte s 300 body na palec, fotka 10 × 15 cm tak odpovídá zhruba 1200 × 1800 px. Při zachování poměru stran stačí zadat jeden rozměr, druhý se dopočítá sám.",
        },
        {
          h2: "Velikost obrázku, nebo velikost plátna?",
          p: "Velikost obrázku… přepočítá všechny pixely, takže se fotka celá zmenší nebo zvětší. Velikost plátna… v nabídce Obrázek naopak obsah nechá, jak je, a jen přidá nebo ubere místo kolem něj. Mřížkou ukotvení s devíti body určíte, kam se stávající obraz umístí: doprostřed, do rohu nebo k jedné hraně. Hodí se to třeba pro okraj kolem fotky, rozšíření obdélníkové fotky na čtverec bez ořezu nebo přidání volného místa pro text.",
        },
        {
          h2: "Zvětšování má své meze",
          p: "Zmenšení fotky je bezpečné: obraz zůstane ostrý a soubor bude výrazně menší. Zvětšení nad původní rozlišení ale nové detaily nepřidá, pixely se jen dopočítají a obraz změkne. Editor ke zvětšování nepoužívá umělou inteligenci, takže z malého obrázku z internetu plakát neuděláte. Pokud potřebujete jen menší soubor, můžete místo změny rozměrů použít posuvník měřítka 10–400 % přímo v dialogu „Exportovat obrázek“. Největší možný dokument má 8000 × 8000 px, v Safari na iPhonu a iPadu zhruba 16,7 megapixelu.",
        },
      ],
      faq: [
        {
          q: "Jak zmenšit fotku bez ztráty kvality?",
          a: "Zmenšete ji na rozměr, ve kterém ji opravdu budete zobrazovat, a uložte ji jako JPEG s kvalitou 80–90, případně jako PNG, jde-li o grafiku. Na displeji rozdíl proti originálu nepoznáte. Vyhněte se jen opakovanému ukládání do JPEG, každé uložení přidá trochu ztráty.",
        },
        {
          q: "Jak zachovat poměr stran?",
          a: "V dialogu Velikost obrázku… nechte zaškrtnutou volbu Zachovat poměr stran. Pak stačí změnit šířku a výška se upraví automaticky, takže se fotka neroztáhne ani nezdeformuje. Volbu vypněte jen tehdy, když chcete obrázek záměrně roztáhnout do jiného tvaru.",
        },
        {
          q: "Jak zmenšit fotku v MB pro e-mail?",
          a: "Nejvíc pomůže menší rozlišení. Zmenšete delší stranu zhruba na 1600–2000 px a exportujte jako JPEG. Dialog „Exportovat obrázek“ ukáže odhad velikosti souboru ještě před stažením, takže hned vidíte, jestli se vejdete do limitu přílohy.",
        },
        {
          q: "Změním velikost více fotek najednou?",
          a: "Ne, hromadné zpracování editor nenabízí. Každou fotku otevřete a upravíte zvlášť, což u několika snímků zabere jen chvilku. Na desítky nebo stovky fotek je vhodnější program určený pro dávkové úpravy.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "rotate-image": {
      title: "Otočit fotku nebo obrázek online",
      description:
        "Otočte fotku o 90° doleva či doprava, zrcadlově ji překlopte nebo srovnejte křivý horizont volným otočením o libovolný úhel. Zdarma, rovnou v prohlížeči.",
      h1: "Otočit fotku online",
      lead:
        "Fotka uložená na bok, zrcadlově obrácené selfie nebo nakřivo vyfocený horizont – všechno opravíte pár kliknutími v liště, která se otevře hned s fotkou.",
      card: "Otočit obrázek",
      cardText: "O 90°, zrcadlově nebo o libovolný úhel",
      steps: [
        "Přetáhněte fotku sem, nebo ji vyberte z disku.",
        "V liště zvolte otočení doleva či doprava, překlopení nebo volné otočení.",
        "Volné otočení potvrďte klávesou <kbd>Enter</kbd> a obrázek exportujte.",
      ],
      sections: [
        {
          h2: "Otočení o 90° a zrcadlení",
          p: "Tlačítka Doleva a Doprava otočí obrázek o 90° a opraví fotku, kterou telefon uložil na bok. Příkaz Překlopit vodorovně vytvoří zrcadlový obraz – hodí se pro selfie z přední kamery, kde je nápis na tričku obráceně, nebo když chcete, aby se postava na plakátu dívala opačným směrem. Překlopit svisle obrátí obraz vzhůru nohama, což využijete spíš u grafiky nebo při skládání odrazu na vodní hladině. Žádná z těchto operací neubírá kvalitu, pixely se jen přeskládají.",
        },
        {
          h2: "Jak srovnat křivý horizont",
          p: "Zvolte volné otočení – editor přepne na nástroj Transformace a kolem obrázku zobrazí rámeček. Uchopte myší místo kousek vně rámečku a táhněte, obraz se natáčí o libovolný úhel. Se stisknutou klávesou <kbd>Shift</kbd> skáče po 15°. Horizont nebo svislou hranu budovy porovnávejte s okrajem okna editoru a otočení potvrďte klávesou <kbd>Enter</kbd>. V rozích pak zůstanou prázdná místa, proto fotku nakonec ořízněte nástrojem Oříznutí tak, aby zmizela.",
        },
        {
          h2: "Jak otočenou fotku uložit",
          p: "Otočený obrázek uložíte tlačítkem Exportovat. Fotky ukládejte jako JPEG, snímky obrazovky, skeny a grafiku jako PNG. Pixely v uloženém souboru jsou už natočené správně, takže se obrázek zobrazí stejně v každém programu – i v takovém, který fotky z telefonu jinak ukazuje na boku. Po volném otočení nejdřív ořízněte prázdné rohy; kdybyste je ponechali, JPEG je vyplní bílou a PNG je zachová průhledné. Dialog „Exportovat obrázek“ ukáže odhad velikosti souboru ještě před stažením a u JPEG a WebP vyvážíte velikost a ostrost posuvníkem kvality.",
        },
      ],
      faq: [
        {
          q: "Jak otočit fotku o 180°?",
          a: "Klikněte dvakrát na otočení o 90° ve stejném směru, nebo v nabídce Obrázek zvolte Otočit o 180°. Fotka se obrátí vzhůru nohama bez jakékoli ztráty kvality a výsledek hned uložíte přes tlačítko Exportovat.",
        },
        {
          q: "Jak zrcadlově otočit fotku?",
          a: "Použijte příkaz Překlopit vodorovně. Levá a pravá strana se prohodí, takže obrácený nápis na selfie bude zase čitelný. Pokud chcete obraz obrátit vzhůru nohama jako odraz ve vodě, zvolte Překlopit svisle.",
        },
        {
          q: "Ztratí fotka otočením kvalitu?",
          a: "Otočení o 90° a 180° i překlopení pixely jen přeskládá, kvalita zůstává stejná. Volné otočení o jiný úhel musí pixely přepočítat, takže obraz může nepatrně změknout. Kvalitu výsledného souboru pak ovlivní ještě nastavení exportu.",
        },
        {
          q: "Proč se po volném otočení objeví v rozích šachovnice?",
          a: "Šachovnice značí průhledné pixely. Natočený obraz už nevyplňuje celé obdélníkové plátno, takže v rozích zbude prázdné místo. Ořízněte ho nástrojem Oříznutí, nebo obrázek uložte jako JPEG, kde se průhledná místa vyplní bílou.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "compress-image": {
      title: "Zmenšit velikost fotky online zdarma",
      description:
        "Zmenšete velikost fotky v MB pro e-mail, web nebo formulář. Nastavte kvalitu JPEG či WebP a měřítko, odhad velikosti souboru uvidíte ještě před stažením.",
      h1: "Zmenšit velikost fotky",
      lead:
        "Editor otevře dialog „Exportovat obrázek“ s formátem JPEG a kvalitou 75. Posouvejte kvalitu a měřítko, sledujte odhadovanou velikost souboru a teprve pak klikněte na Stáhnout.",
      card: "Zmenšit velikost fotky",
      cardText: "Komprese JPEG a WebP s odhadem velikosti souboru",
      steps: [
        "Přetáhněte fotku sem, nebo ji vyberte z disku.",
        "V dialogu „Exportovat obrázek“ nastavte formát, kvalitu a měřítko.",
        "Zkontrolujte odhad velikosti souboru a klikněte na Stáhnout.",
      ],
      sections: [
        {
          h2: "Co zmenší soubor nejvíc",
          p: "Největší úsporu přinese menší počet pixelů. Fotka z telefonu mívá 12 megapixelů i víc, přitom na displeji ji málokdo prohlíží větší než 2000 px. Posuvník měřítka na 50 % zmenší šířku i výšku na polovinu a počet pixelů na čtvrtinu, takže soubor výrazně zmenší. Teprve potom dolaďte kvalitu: hodnoty kolem 70–80 jsou u většiny fotek na pohled k nerozeznání od originálu, pod 50 se začnou objevovat čtverečky a rozpité hrany.",
        },
        {
          h2: "JPEG, nebo WebP?",
          p: "JPEG otevře každý program, telefon i úřední formulář, proto je nejjistější volbou pro e-mail a přílohy. WebP dává při stejné kvalitě obvykle menší soubor a umí průhlednost, takže se hodí na web a do e-shopu, některé starší programy ho ale neotevřou. PNG je bezztrátový – na fotky zbytečně velký, u snímků obrazovky s textem ale bývá ostřejší a často i menší než JPEG. Formát přepnete v témže dialogu a odhad velikosti se hned přepočítá.",
        },
        {
          h2: "Jak se vejít do limitu přílohy",
          p: "Formuláře a portály často omezují přílohy na jednotky megabajtů, některé i na pár set kilobajtů. Na limit 1 MB obvykle stačí delší strana kolem 2000 px a kvalita 75–80. Profilová fotka nebo obrázek do inzerátu se vejde do 100–300 kB při 800–1200 px. Protože odhad velikosti vidíte ještě před stažením, nemusíte zkoušet naslepo. Úprava probíhá jen ve vašem prohlížeči, takže tak klidně zmenšíte i sken občanky nebo potvrzení pro úřad.",
        },
      ],
      faq: [
        {
          q: "Jak zmenšit fotku pod 1 MB?",
          a: "U fotky z telefonu obvykle stačí měřítko kolem 50 % a kvalita JPEG mezi 70 a 80. Odhad velikosti v dialogu „Exportovat obrázek“ ukáže, jestli jste pod limitem. Pokud ne, ubírejte nejdřív měřítko a až potom kvalitu.",
        },
        {
          q: "Zhorší se zmenšením kvalita fotky?",
          a: "Komprese JPEG a WebP je ztrátová, ale při kvalitě 70 a výš bývá rozdíl na displeji téměř neviditelný. Menší rozměry ubírají detaily, které by se na běžné obrazovce stejně nezobrazily. Originál na disku zůstává nedotčený, editor stáhne novou kopii.",
        },
        {
          q: "Proč je soubor pořád moc velký?",
          a: "Nejčastěji kvůli vysokému rozlišení – samotné snížení kvality u velké fotky nestačí. Snižte měřítko, případně přepněte formát na WebP. Pozor také na PNG: u fotek dává mnohem větší soubory než JPEG.",
        },
        {
          q: "Zmenším více fotek najednou?",
          a: "Ne, editor pracuje vždy s jedním obrázkem a hromadnou kompresi nenabízí. Každou fotku otevřete a exportujte zvlášť. U několika snímků je to otázka pár minut, protože dialog exportu se otevře hned po načtení.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "image-converter": {
      title: "Převod obrázků: JPG, PNG, WebP, HEIC, PSD",
      description:
        "Převeďte obrázek mezi formáty PNG, JPG, WebP a PSD. Otevře i HEIC, AVIF, GIF, SVG a BMP. Zdarma, bez registrace a bez nahrávání souborů na cizí server.",
      h1: "Převod obrázků mezi formáty",
      lead:
        "Otevřete obrázek v téměř libovolném běžném formátu a v dialogu „Exportovat obrázek“ vyberte, do čeho ho chcete převést. Převod proběhne přímo ve vašem prohlížeči.",
      card: "Převod formátů",
      cardText: "PNG, JPG, WebP a PSD z HEIC, AVIF, GIF, SVG i BMP",
      steps: [
        "Přetáhněte obrázek sem, nebo ho vyberte z disku.",
        "V dialogu „Exportovat obrázek“ zvolte cílový formát a kvalitu.",
        "Klikněte na Stáhnout a uložte převedený soubor.",
      ],
      sections: [
        {
          h2: "Které formáty otevřete a do kterých uložíte",
          p: "Editor načte PNG, JPEG, WebP, GIF, SVG, BMP, AVIF (pokud ho váš prohlížeč umí dekódovat), fotky z iPhonu ve formátu HEIC/HEIF a soubory PSD z Photoshopu. Uložit je můžete jako PNG, JPEG, WebP nebo jako PSD s vrstvami. U GIFu se načte jen první snímek animace a SVG se převede na pixely. Otevřený obrázek můžete před převodem ještě oříznout, zmenšit nebo barevně upravit a exportovat až hotový výsledek.",
        },
        {
          h2: "Jaký formát vybrat",
          p: "<strong>JPEG</strong> je pro fotky: malý soubor a univerzální podpora, ale bez průhlednosti – průhledná místa se vyplní bílou. <strong>PNG</strong> je bezztrátový a průhlednost zachová, proto se hodí pro loga, ikony, snímky obrazovky a grafiku s textem. <strong>WebP</strong> umí obojí a dává menší soubory, vhodné pro web; starší programy ho ale nemusí otevřít. <strong>PSD</strong> zvolte, když chcete v práci pokračovat ve Photoshopu nebo jiném grafickém programu, který vrstvy z PSD načte.",
        },
        {
          h2: "Převod bez odesílání souborů",
          p: "Mnoho online převodníků soubor nahraje na svůj server, převede ho tam a pošle zpět. Tady se nic takového neděje: obrázek se dekóduje a znovu zakóduje ve vaší záložce prohlížeče. Nemusíte proto řešit, kdo získá přístup k vašim dokumentům, fotkám dětí nebo pracovním podkladům. Rychlost převodu proto nezávisí na připojení a po první návštěvě převodník funguje i offline. Jedinou výjimkou je HEIC mimo Safari, kde si prohlížeč při prvním použití jednou stáhne dekodér.",
        },
      ],
      faq: [
        {
          q: "Jak převést obrázek do JPG?",
          a: "Otevřete ho v editoru, v dialogu „Exportovat obrázek“ zvolte JPEG, nastavte kvalitu (pro fotky 80–90) a klikněte na Stáhnout. Pokud měl obrázek průhledné části, budou v JPEG bílé. Původní soubor zůstane beze změny.",
        },
        {
          q: "Umí převodník HEIC a AVIF?",
          a: "HEIC z iPhonu otevře: Safari ho dekóduje samo, v jiných prohlížečích se jednou stáhne dekodér a převod pak běží lokálně. AVIF otevřete, pokud ho podporuje váš prohlížeč. Uložit do HEIC ani AVIF ale nejde, výstupem je PNG, JPEG, WebP nebo PSD.",
        },
        {
          q: "Převedu i více souborů najednou?",
          a: "Ne, editor převádí vždy jeden obrázek a hromadný převod celé složky nenabízí. U pár souborů to nevadí: každý otevřete, v dialogu exportu zvolíte formát a stáhnete ho. Na stovky souborů je vhodnější program pro dávkové zpracování.",
        },
        {
          q: "Do jakého formátu uložit obrázek s průhledným pozadím?",
          a: "Do PNG, nebo do WebP, pokud chcete menší soubor. Oba formáty průhlednost zachovají. JPEG průhlednost uložit neumí a prázdná místa vyplní bílou barvou, takže logo by dostalo bílý obdélník kolem sebe.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "png-to-jpg": {
      title: "Převod PNG na JPG online zdarma",
      description:
        "Převeďte PNG na JPG přímo v prohlížeči. Nastavíte kvalitu, uvidíte odhad velikosti souboru a průhledné části se vyplní bílou. Bez nahrávání a bez registrace.",
      h1: "Převod PNG na JPG",
      lead:
        "Přetáhněte PNG sem a editor rovnou otevře export s formátem JPEG. Stačí zvolit kvalitu a stáhnout menší soubor, který otevře každý program.",
      card: "PNG na JPG",
      cardText: "Menší soubory z PNG, průhlednost se vyplní bílou",
      steps: [
        "Přetáhněte soubor PNG sem, nebo ho vyberte z disku.",
        "V dialogu „Exportovat obrázek“ s předvoleným JPEG nastavte kvalitu.",
        "Zkontrolujte odhad velikosti a klikněte na Stáhnout.",
      ],
      sections: [
        {
          h2: "Kdy se převod z PNG do JPG vyplatí",
          p: "PNG ukládá každý pixel bezztrátově. U grafiky a snímků obrazovky je to výhoda, u fotek ale vznikají zbytečně velké soubory – fotka z telefonu uložená jako PNG snadno přesáhne deset megabajtů. Převod na JPG ji zmenší na zlomek, aniž byste na displeji poznali rozdíl. JPG je také jistota tam, kde formuláře, starší programy nebo tiskové služby PNG nepřijímají. Loga, ikony a obrázky s ostrými hranami a textem ale raději nechte v PNG.",
        },
        {
          h2: "Co se stane s průhledností",
          p: "JPEG průhlednost neumí. Všechna průhledná i poloprůhledná místa PNG se při převodu vyplní bílou barvou – logo na průhledném pozadí tak dostane kolem sebe bílý obdélník. Potřebujete-li jinou barvu pozadí, přidejte v panelu Vrstvy novou vrstvu, přetáhněte ji pod obrázek a ještě před exportem ji vyplňte nástrojem Výplň. Když má průhlednost zůstat zachovaná, zvolte v dialogu místo JPEG formát WebP, nebo soubor nechte v PNG.",
        },
        {
          h2: "Jakou kvalitu nastavit",
          p: "Pro fotky volte kvalitu 80–90: soubor bude výrazně menší a obraz zůstane čistý. Na web nebo do e-mailu obvykle stačí 70–80. U snímků obrazovky s drobným písmem se při nízké kvalitě objeví kolem písmen šum, proto tam držte hodnotu nad 85, případně zvažte, jestli nezůstat u PNG. Odhad velikosti souboru se přepočítá při každém posunutí posuvníku, takže rozumný kompromis mezi velikostí a kvalitou najdete během pár vteřin.",
        },
      ],
      faq: [
        {
          q: "Ztratí obrázek převodem z PNG na JPG kvalitu?",
          a: "JPEG je ztrátový formát, takže nepatrně ano. Při kvalitě 85 a výš je ale rozdíl u fotek prakticky neviditelný. Patrnější bývá u textu a ostrých čar, kde se může objevit jemný šum kolem hran.",
        },
        {
          q: "Proč má převedený obrázek bílé pozadí?",
          a: "Původní PNG mělo průhledné pozadí a JPEG průhlednost uložit neumí, proto ji editor vyplní bílou. Pokud chcete průhlednost zachovat, uložte obrázek jako WebP nebo PNG. Jinou barvu pozadí přidáte vlastní vrstvou pod obrázkem.",
        },
        {
          q: "Dá se převést i snímek obrazovky ze schránky?",
          a: "Ano. Snímek vložte přímo ze schránky klávesami <kbd>Ctrl</kbd>+<kbd>V</kbd> (na Macu <kbd>⌘</kbd>+<kbd>V</kbd>) a exportujte ho jako JPEG, nemusíte ho předtím ukládat jako soubor. Než ho pošlete dál, můžete v editoru třeba rozmazat citlivé údaje.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "webp-to-jpg": {
      title: "Převod WebP na JPG online",
      description:
        "Převeďte obrázek WebP na JPG, který otevře každý program i telefon. Kvalitu nastavíte posuvníkem, průhlednost zachováte exportem do PNG. Zdarma, bez nahrávání.",
      h1: "Převod WebP na JPG",
      lead:
        "Stáhli jste obrázek z webu a program ho nechce otevřít? Přetáhněte soubor .webp sem a uložte ho jako JPG nebo PNG.",
      card: "WebP na JPG",
      cardText: "Obrázky z webu do formátu, který otevře vše",
      steps: [
        "Přetáhněte soubor WebP sem, nebo ho vyberte z disku.",
        "V dialogu „Exportovat obrázek“ ponechte JPEG, nebo zvolte PNG.",
        "Nastavte kvalitu a klikněte na Stáhnout.",
      ],
      sections: [
        {
          h2: "Proč obrázky z webu končí na .webp",
          p: "Weby dnes obrázky často posílají ve formátu WebP, protože je při stejné kvalitě menší než JPEG a stránky se načítají rychleji. Když si takový obrázek uložíte, máte v počítači soubor .webp. Prohlížeč ho zobrazí bez problémů, starší prohlížeč fotek, kancelářský balík, tiskový software nebo nahrávací formulář na úřadě si s ním ale poradit nemusí. Převod do JPG tento problém vyřeší, protože JPG otevře prakticky každý program i zařízení.",
        },
        {
          h2: "JPG, nebo PNG?",
          p: "WebP může obsahovat fotku i grafiku s průhledností. Pro fotografie je JPG správná volba: soubor zůstane malý a kvalita 85–90 zachová detaily. Jde-li o logo, ikonu nebo produkt na průhledném pozadí, zvolte v dialogu PNG – JPEG by průhledná místa vyplnil bílou. PNG bývá větší, zato je bezztrátový. Odhad velikosti souboru vidíte ještě před stažením, takže snadno porovnáte, který formát vyjde pro konkrétní obrázek výhodněji.",
        },
        {
          h2: "Úpravy před uložením",
          p: "WebP se otevře v plnohodnotném editoru, takže ho můžete před převodem rovnou vylepšit. Nástrojem Oříznutí odstraňte okraj nebo pruh převzatý z webové stránky, v dialogu Velikost obrázku… obrázek zmenšete pro dokument či prezentaci a v panelu Korekce dolaďte jas a kontrast. Dialog „Exportovat obrázek“ pak znovu otevřete tlačítkem Exportovat a obrázek stáhněte. Úpravy se zapíšou jen do nového souboru, původní soubor .webp na disku zůstane beze změny.",
        },
      ],
      faq: [
        {
          q: "Jak otevřít soubor WebP?",
          a: "Přetáhněte ho do pole na této stránce, nebo ho vyberte z disku – editor ho otevře přímo v prohlížeči, nic neinstalujete. Pak ho můžete upravit, oříznout nebo převést do JPG či PNG pro programy, které WebP neznají.",
        },
        {
          q: "Ztratí obrázek převodem kvalitu?",
          a: "WebP z webu už bývá komprimovaný a převod do JPG přidá další ztrátovou kompresi. Při kvalitě 85–90 je ale rozdíl prakticky neznatelný. Pokud nechcete žádnou další ztrátu, uložte obrázek jako PNG – soubor bude větší, ale bezztrátový.",
        },
        {
          q: "Proč je JPG větší než původní WebP?",
          a: "WebP komprimuje účinněji než JPEG, takže stejný obrázek v JPG obvykle vyjde o něco větší. Pokud velikost vadí, snižte kvalitu na 75–80 nebo zmenšete měřítko. Odhad velikosti v dialogu exportu ukáže výsledek dřív, než soubor stáhnete.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "heic-to-jpg": {
      title: "Převod HEIC na JPG – fotky z iPhonu",
      description:
        "Převeďte fotky z iPhonu z HEIC na JPG přímo v prohlížeči, i na Windows a Androidu. Fotka se nikam nenahrává, kvalitu i velikost nastavíte před stažením.",
      h1: "Převod HEIC na JPG",
      lead:
        "iPhone ukládá fotky ve formátu HEIC, se kterým si spousta programů a webů neporadí. Přetáhněte fotku sem a uložte ji jako JPG, aniž by opustila váš počítač.",
      card: "HEIC na JPG",
      cardText: "Fotky z iPhonu do JPG bez nahrávání",
      steps: [
        "Přetáhněte fotku HEIC sem, nebo ji vyberte z disku.",
        "Počkejte na dekódování, pak se otevře dialog „Exportovat obrázek“ s JPEG.",
        "Nastavte kvalitu a klikněte na Stáhnout.",
      ],
      sections: [
        {
          h2: "Co je HEIC a proč ho převádět",
          p: "HEIC (také HEIF) je formát, do kterého iPhone a iPad ve výchozím nastavení ukládají fotky. Při stejné kvalitě zabírá obvykle méně místa než JPEG, jenže si s ním neporadí každý: Windows bez příslušného rozšíření ho neotevřou a řada webových formulářů, e-shopů i fotosběrných služeb ho nepřijme. JPG naopak funguje všude. Převod je proto nejjednodušší cesta, jak fotku z iPhonu poslat e-mailem, nahrát na úřad nebo dát vytisknout.",
        },
        {
          h2: "Jak převod funguje a proč zůstane soukromý",
          p: "V Safari dekóduje HEIC přímo prohlížeč. V Chromu, Edgi nebo Firefoxu si editor při prvním použití jednou stáhne knihovnu dekodéru z CDN jsDelivr a samotné dekódování pak proběhne lokálně ve vašem zařízení. Stahuje se tedy jen program, fotka se nikam neodesílá. U velké fotky může první otevření chvilku trvat. Po dekódování se otevře dialog „Exportovat obrázek“ s předvoleným JPEG, kde nastavíte kvalitu a měřítko.",
        },
        {
          h2: "Co se při převodu nepřenese",
          p: "Převádí se jen hlavní snímek. Pohyb z Live Photo, hloubková mapa z portrétního režimu ani další snímky ze sekvence se do JPG nedostanou – JPEG je ostatně uložit neumí. Pro běžné použití to nevadí, výsledkem je obyčejná fotka, jak ji vidíte v aplikaci Fotky. Kvalitu 85–90 zvolte, když chcete zachovat detaily, pro e-mail a sociální sítě stačí 70–80. Je-li soubor zbytečně velký, snižte v témže dialogu měřítko.",
        },
      ],
      faq: [
        {
          q: "Nahraje se moje fotka z iPhonu na server?",
          a: "Ne. Stahuje se pouze knihovna dekodéru, a to jen mimo Safari a jednou při prvním použití. Fotka samotná se dekóduje i převede přímo ve vašem prohlížeči a nikam se neodesílá. Proto je převod vhodný i pro soukromé snímky a fotky dokladů.",
        },
        {
          q: "Jak převést HEIC na JPG ve Windows?",
          a: "Otevřete tuto stránku v Chromu, Edgi nebo Firefoxu a fotku HEIC přetáhněte do pole pro obrázek. Nemusíte instalovat žádné rozšíření pro Windows ani jiný program. Po dekódování nastavíte kvalitu a JPG stáhnete jako běžný soubor.",
        },
        {
          q: "Funguje převod HEIC i bez internetu?",
          a: "V Safari ano, protože HEIC dekóduje sám prohlížeč a editor po první návštěvě funguje offline. V ostatních prohlížečích je při prvním převodu potřeba připojení, aby se mohla stáhnout knihovna dekodéru.",
        },
        {
          q: "Zůstane fotka v plném rozlišení?",
          a: "Na počítači zůstanou běžné fotky z iPhonu se 12 nebo 24 megapixely v plném rozlišení. Snímky ve 48 megapixelech (8064 × 6048 px) editor při otevření nepatrně zmenší, protože dokument může mít nejvýš 8000 px na stranu. Safari na iPhonu a iPadu ale zvládne plátno jen asi do 16,7 megapixelu, takže tam v plném rozlišení zůstanou 12megapixelové snímky a větší se zmenší. Kvalitu JPEG pak určíte posuvníkem.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "blur-image": {
      title: "Rozmazat fotku nebo obličej na fotce",
      description:
        "Rozmažte obličej, SPZ nebo osobní údaje na fotce či snímku obrazovky. Označte oblast a zvolte rozmazání nebo pixelizaci. Fotka zůstává jen ve vašem prohlížeči.",
      h1: "Rozmazat fotku nebo její část",
      lead:
        "Označte obličej, poznávací značku nebo adresu a jedním kliknutím je rozmažte či pixelizujte tak, aby nešly rozpoznat. Vše proběhne ve vašem prohlížeči, citlivá fotka nikam neodchází.",
      card: "Rozmazat fotku",
      cardText: "Rozmazání obličejů, SPZ a osobních údajů",
      steps: [
        "Přetáhněte fotku nebo snímek obrazovky sem.",
        "Nástrojem Obdélníkový výběr označte, co chcete skrýt.",
        "V liště zvolte rozmazání nebo pixelizaci a obrázek exportujte.",
      ],
      sections: [
        {
          h2: "Jak spolehlivě skrýt obličej nebo SPZ",
          p: "Editor se otevře s nástrojem Obdélníkový výběr. Natáhněte rámeček přes obličej, poznávací značku, adresu nebo číslo účtu na snímku obrazovky a v liště zvolte rozmazání, nebo pixelizaci. Síla efektu se řídí velikostí výběru, takže i velký obličej se rozmaže natolik, že ho nikdo nepozná. Pro hlavu se hodí Eliptický výběr, pro nepravidelné tvary Laso, pro jednobarevnou plochu Kouzelná hůlka. Více míst skryjete postupně jedno po druhém.",
        },
        {
          h2: "Rozmazání, nebo pixelizace?",
          p: "Rozmazání působí jemněji a na fotce méně ruší – hodí se pro kolemjdoucí v pozadí nebo detaily, které nemají odvádět pozornost. Pixelizace vytvoří typické čtverečky a na první pohled dává najevo, že bylo něco záměrně skryto, což se hodí u snímků obrazovky s osobními údaji nebo u fotek do inzerátu. Když výběru nastavíte prolnutí okraje, rozmazaná oblast plynule přejde do okolí a nebude mít ostrou hranu. Rozmazání i pixelizace z lišty potřebují výběr – když žádný není, editor vás nejdřív vyzve, abyste označili, co chcete skrýt.",
        },
        {
          h2: "Rozostřené pozadí a jemné rozmazání štětcem",
          p: "Nástroj Rozmazání funguje jako štětec: přejíždíte jím po fotce a obraz pod ním měkne. Hodí se k jemnému změkčení rušivého pozadí nebo drobných detailů. V panelu Filtry najdete také filtry Jemné rozostření a Pixelizace pro celý obrázek nebo výběr. Pro efekt rozostřeného pozadí obtáhněte postavu nástrojem Laso, výběr invertujte a rozmažte vše kolem. Výsledek uložte jako JPEG nebo PNG – rozmazání se zapíše do pixelů a ze staženého souboru už nejde odstranit.",
        },
      ],
      faq: [
        {
          q: "Jak rozmazat obličej na fotce?",
          a: "Označte obličej nástrojem Eliptický výběr nebo Obdélníkový výběr a v liště zvolte rozmazání. Síla se přizpůsobí velikosti výběru, takže obličej nebude rozpoznatelný. Postup zopakujte u každé další osoby a nakonec fotku exportujte.",
        },
        {
          q: "Dá se rozmazání zpětně odstranit?",
          a: "Ve staženém souboru ne. Rozmazání i pixelizace se zapíšou přímo do pixelů a původní detail v exportovaném obrázku už není. Krokem zpět ho vrátíte jen v editoru, dokud máte obrázek otevřený. Sdílejte proto vždy exportovaný JPEG nebo PNG.",
        },
        {
          q: "Je bezpečné rozmazat doklad nebo snímek obrazovky online?",
          a: "Tady ano, protože se nic neodesílá. Editor běží jen ve vaší záložce prohlížeče a obrázek nikdy neopustí vaše zařízení. Můžete tak zakrýt rodné číslo, číslo účtu nebo adresu dřív, než snímek pošlete dál.",
        },
        {
          q: "Proč je rozmazání u velkého výběru silnější?",
          a: "Síla se odvozuje od velikosti výběru, aby obsah zmizel spolehlivě: malý výběr přes SPZ i velký přes celou postavu skončí nečitelný. Pokud chcete jen jemné změkčení, použijte nástroj Rozmazání a místo přejeďte jen několikrát.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "add-text-to-photo": {
      title: "Přidat text do fotky online",
      description:
        "Napište text do fotky přímo na plátno: šest písem, velikost až 400 px, tučně, kurzívou i s nižším krytím. Hodí se na meme, popisky a vodoznak. Zdarma.",
      h1: "Přidat text do fotky",
      lead:
        "Klikněte do obrázku a pište – text se zobrazuje rovnou ve výsledném písmu a velikosti. Každý nápis zůstane na samostatné vrstvě, takže ho můžete později opravit nebo posunout.",
      card: "Text do fotky",
      cardText: "Popisky, meme a vodoznaky na upravitelných vrstvách",
      steps: [
        "Přetáhněte fotku sem, nebo ji vyberte z disku.",
        "Nástrojem Text klikněte do obrázku a napište nápis.",
        "Potvrďte klávesami <kbd>Ctrl</kbd>+<kbd>Enter</kbd>, nástrojem Přesun nápis umístěte a obrázek exportujte.",
      ],
      sections: [
        {
          h2: "Písmo, velikost a barva",
          p: "V liště nástroje Text vyberete jedno ze šesti písem – systémové bezpatkové, patkové, neproporcionální, Impact, ručně psané nebo Trebuchet – a velikost od 6 do 400 px. Text zarovnáte doleva, na střed nebo doprava a nastavíte mu tučný řez, kurzívu a krytí. Barvu určuje hlavní barva v panelu Barva, takže ji změníte stejně jako barvu štětce, případně ji nástrojem Kapátko nasajete přímo z fotky. Na meme se hodí Impact, na jemné popisky patkové písmo.",
        },
        {
          h2: "Text zůstává upravitelný",
          p: "Každý nápis vznikne jako samostatná textová vrstva v panelu Vrstvy. Překlep opravíte tak, že na text znovu kliknete nástrojem Text, a nástrojem Přesun ho posunete jinam. Upravitelný zůstává, dokud se nezmění pixely jeho vrstvy. Malování, filtry, korekce (i Úrovně a Křivky), nástroj Transformace, otočení či překlopení obrázku, příkazy Sloučit dolů a Použít masku nebo přesun nástrojem Přesun při aktivním výběru z něj udělají obyčejné pixely. Pokud chcete text natočit, udělejte to až úplně nakonec. Práci uloženou jako projekt <code>.paint</code> otevřete později i se všemi vrstvami.",
        },
        {
          h2: "Meme, popisky a vodoznak",
          p: "Na meme napište krátký text velkým písmem Impact k hornímu a dolnímu okraji obrázku, bílá barva se dobře čte na většině fotek. Popisek k fotce působí čistěji menším písmem v rohu. Pro vodoznak napište jméno nebo adresu webu a krytí snižte na 30–50 %, aby nápis nepřekrýval motiv. Na pestrém pozadí pomůže, když pod text přidáte novou vrstvu a nástrojem Obdélník na ni nakreslíte poloprůhledný podklad.",
        },
      ],
      faq: [
        {
          q: "Jak napsat text do fotky na mobilu?",
          a: "Otevřete tuto stránku v mobilním prohlížeči a vyberte fotku z galerie. Nástrojem Text klepněte na místo, kde má nápis začínat, a pište klávesnicí telefonu. Hotový nápis pak posunete nástrojem Přesun tažením prstu.",
        },
        {
          q: "Můžu text později změnit?",
          a: "Ano. Text je na vlastní textové vrstvě, stačí na něj znovu kliknout nástrojem Text a nápis upravit. Změnu potvrďte klávesami <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (na Macu <kbd>⌘</kbd>+<kbd>Enter</kbd>). Upravitelnost končí, jakmile se změní pixely vrstvy – třeba malováním, filtrem, korekcí, nástrojem Transformace, otočením či překlopením obrázku nebo příkazem Sloučit dolů.",
        },
        {
          q: "Jaká písma jsou k dispozici?",
          a: "Šest: systémové bezpatkové, patkové, neproporcionální, Impact, ručně psané a Trebuchet. Vlastní písma nahrát nelze. Podoba systémových písem se může mírně lišit podle operačního systému, Impact a Trebuchet vypadají všude podobně, pokud je zařízení má nainstalované.",
        },
        {
          q: "Jak udělat vodoznak na fotku?",
          a: "Napište své jméno nebo adresu webu, zvolte bílou či černou barvu a v liště nástroje Text snižte krytí zhruba na 40 %. Nástrojem Přesun nápis umístěte do rohu, nebo přes střed fotky, pokud chcete silnější ochranu. Pak obrázek exportujte.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "black-and-white-photo": {
      title: "Černobílá fotka online – převod zdarma",
      description:
        "Převeďte fotku na černobílou hned po otevření. Vyberte jemné odstíny šedi, kontrastní Noir nebo sépii a dolaďte kontrast. Zdarma, bez registrace a nahrávání.",
      h1: "Černobílá fotka jedním kliknutím",
      lead:
        "Jakmile fotku přetáhnete sem, editor na ni rovnou použije filtr Odstíny šedi. Pokud chcete výraznější nebo starožitný vzhled, zvolte v liště filtr Noir nebo Sépie.",
      card: "Černobílá fotka",
      cardText: "Odstíny šedi, Noir a Sépie jedním kliknutím",
      steps: [
        "Přetáhněte barevnou fotku sem.",
        "Filtr Odstíny šedi se použije sám, pro jiný vzhled zvolte v liště filtr Noir nebo Sépie.",
        "Klikněte na Exportovat a černobílou fotku stáhněte.",
      ],
      sections: [
        {
          h2: "Odstíny šedi, Noir, nebo Sépie?",
          p: "Odstíny šedi převedou barvy na šedou podle jejich jasu – výsledek je klidný a sedí portrétům i dokumentárním snímkům. Noir přidá výrazný kontrast s hlubokou černou a jasnou bílou, takže vynikne architektura, ulice nebo dramatická obloha. Sépie dá fotce teplý hnědavý tón starých tisků a funguje u rodinných a svatebních fotek. Převod je jeden krok historie, takže ho tlačítkem v liště nebo klávesami <kbd>Ctrl</kbd>+<kbd>Z</kbd> snadno vrátíte a zkusíte jinou variantu.",
        },
        {
          h2: "Jak černobílou fotku doladit",
          p: "Černobílá fotka stojí na kontrastu. V panelu Korekce zkuste přidat kontrast, případně zesvětlit stíny, pokud se v tmavých místech ztrácí detail. Jemnější kontrolu dávají Křivky… – mírná esovitá křivka ztmaví tmavé tóny a zesvětlí světlé – nebo Úrovně…, kde posunutím černého a bílého bodu k okrajům histogramu získáte plný tonální rozsah. Atmosféru starého filmu přidá posuvník zrna, oko k hlavnímu motivu přitáhne vinětace.",
        },
        {
          h2: "Barevný akcent: černobílá fotka s jednou barvou",
          p: "Filtr se použije jen uvnitř výběru, pokud nějaký existuje. Toho využijete pro efekt barevného akcentu. Krokem zpět vraťte fotce barvy, označte objekt, který má zůstat barevný (třeba červený deštník nebo kytici), nástrojem Laso nebo Kouzelná hůlka, výběr invertujte a v panelu Filtry klikněte na Odstíny šedi. Všechno kolem zešedne a vybraný objekt si barvu ponechá. Prolnutí okraje u nástroje výběru zajistí, že přechod nebude příliš ostrý.",
        },
      ],
      faq: [
        {
          q: "Jak udělat z barevné fotky černobílou?",
          a: "Přetáhněte ji na tuto stránku – filtr Odstíny šedi se použije automaticky hned po otevření. Pak stačí kliknout na Exportovat a v dialogu „Exportovat obrázek“ výsledek stáhnout. Originál na vašem disku zůstane barevný.",
        },
        {
          q: "Jde vrátit barvy zpátky?",
          a: "V editoru ano: převod je jeden krok historie, takže ho vrátíte tlačítkem v liště nebo klávesami <kbd>Ctrl</kbd>+<kbd>Z</kbd>. Ve staženém JPEG nebo PNG už barevná informace není, proto si originál ponechte.",
        },
        {
          q: "Proč černobílá fotka vypadá šedě a ploše?",
          a: "Barevná fotka často žije z kontrastu barev, který se po převodu ztratí. Zkuste filtr Noir, nebo v panelu Korekce přidejte kontrast a v dialogu Úrovně… přisuňte černý a bílý bod k okrajům histogramu. Fotka tím získá hloubku.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "invert-colors": {
      title: "Invertovat barvy obrázku – negativ online",
      description:
        "Invertujte barvy fotky či obrázku a vytvořte negativ jedním kliknutím. Hodí se na naskenované negativy, tmavé snímky obrazovky i efekt rentgenu. Zdarma.",
      h1: "Invertovat barvy obrázku",
      lead:
        "Po otevření se na obrázek rovnou použije filtr Inverze: světlá místa ztmavnou, tmavá zesvětlí a každá barva se změní na doplňkovou. Průhlednost zůstává zachovaná.",
      card: "Invertovat barvy",
      cardText: "Negativ fotky, skenu nebo snímku obrazovky",
      steps: [
        "Přetáhněte obrázek sem, nebo ho vyberte z disku.",
        "Filtr Inverze se použije automaticky, s doladěním pomůže dialog Úrovně… v nabídce Korekce.",
        "Klikněte na Exportovat a invertovaný obrázek stáhněte.",
      ],
      sections: [
        {
          h2: "Naskenovaný negativ zpět na fotku",
          p: "Máte-li naskenované nebo vyfocené černobílé negativy, inverze z nich udělá pozitiv. U barevných negativů je situace složitější: oranžový podklad filmu se po inverzi změní v modrý nádech. Ten zmírníte v dialogu Úrovně…, kde pro každý kanál RGB zvlášť posunete černý a bílý bod k okrajům histogramu, případně posuvníkem teploty v panelu Korekce. Výsledek nebude jako z fotolaboratoře, na digitalizaci rodinného archivu ale často stačí.",
        },
        {
          h2: "Tmavé snímky obrazovky a efekt rentgenu",
          p: "Inverze se hodí i k rychlému převedení snímku obrazovky z tmavého režimu na světlý, třeba když ho chcete vytisknout a nespotřebovat přitom celý toner. Barevné prvky se ale změní na doplňkové barvy, takže logo nebo zvýraznění budou mít jiný odstín. Na portrétu nebo květině vytvoří inverze tajemný efekt připomínající rentgenový snímek; zkombinujte ji s filtrem Odstíny šedi a dostanete klasický černobílý negativ jako ze staré filmové role.",
        },
        {
          h2: "Inverze jen části obrázku",
          p: "Filtr pracuje uvnitř výběru, pokud nějaký existuje. Automatickou inverzi po otevření tedy vraťte krokem zpět, označte oblast nástrojem Obdélníkový výběr nebo Laso a v panelu Filtry klikněte na filtr Inverze. Takto převedete třeba jen tmavý panel ve snímku obrazovky nebo jedno okno aplikace a zbytek necháte, jak je. Pro jemný přechod mezi invertovanou a původní částí nastavte výběru prolnutí okraje ještě před použitím filtru.",
        },
      ],
      faq: [
        {
          q: "Co přesně dělá inverze barev?",
          a: "Každou barvu nahradí jejím protějškem: černou bílou, bílou černou, červenou azurovou, modrou žlutou a zelenou purpurovou. Vznikne tak negativ obrázku. Druhá inverze vrátí obraz přesně do původní podoby.",
        },
        {
          q: "Zůstane průhledné pozadí zachované?",
          a: "Ano. Inverze mění jen barvy, průhlednost pixelů nechává beze změny. Logo s průhledným pozadím proto po inverzi zůstane bez pozadí, pokud ho uložíte jako PNG nebo WebP. JPEG by průhledná místa vyplnil bílou.",
        },
        {
          q: "Jak z negativu udělat fotku?",
          a: "Negativ naskenujte, nebo ho vyfoťte na rovnoměrně prosvětlené ploše, třeba na displeji tabletu s bílou obrazovkou, a přetáhněte sem. Inverze proběhne automaticky. Barevný nádech dorovnejte v dialogu Úrovně… po jednotlivých kanálech a okraje filmu odstraňte nástrojem Oříznutí.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "photo-filters": {
      title: "Filtry na fotky online zdarma",
      description:
        "Filtry na fotky online: 21 efektů s živým náhledem z vaší fotky – Vintage, Sépie, Duotón, Kresba tužkou a další. Lze je kombinovat. Zdarma, bez registrace.",
      h1: "Filtry na fotky online",
      lead:
        "Panel Filtry ukazuje každý z 21 filtrů jako živou miniaturu vaší fotky, takže výsledek vidíte dřív, než kliknete. Jedno kliknutí filtr použije, další kliknutí přidá další.",
      card: "Filtry na fotky",
      cardText: "21 filtrů s náhledem přímo z vaší fotky",
      steps: [
        "Přetáhněte fotku sem, nebo ji vyberte z disku.",
        "V panelu Filtry klikněte na miniaturu filtru, který se vám líbí.",
        "Případně přidejte další filtr a klikněte na Exportovat.",
      ],
      sections: [
        {
          h2: "Přehled všech 21 filtrů",
          p: "<strong>Barvy a nálada:</strong> Živé barvy, Vybledlé, Teplé, Studené, Vintage a Duotón, který fotku přebarví do dvou tónů podle hlavní a vedlejší barvy v panelu Barva. <strong>Černobílé a tónované:</strong> Odstíny šedi, Noir a Sépie. <strong>Grafické efekty:</strong> Inverze, Posterizace, Práh, Solarizace, Reliéf, Detekce hran, Kresba tužkou a Pixelizace. <strong>Ostrost a světlo:</strong> Jemné rozostření, Zaostření, Záře a Vinětace. Každý filtr je jeden krok historie, takže ho klávesami <kbd>Ctrl</kbd>+<kbd>Z</kbd> hned vrátíte.",
        },
        {
          h2: "Kombinování filtrů",
          p: "Filtry se sčítají: každý další se použije na výsledek předchozího. Zkuste například kombinaci filtrů Teplé a Vinětace pro útulný podvečerní portrét, filtr Vybledlé s posuvníkem zrna v panelu Korekce pro vzhled staré fotky z alba, nebo dvojici Posterizace a Detekce hran pro komiksový efekt. Na pořadí záleží – filtr Zaostření použitý před filtrem Pixelizace dá jiný výsledek než naopak. Když se kombinace nepovede, vraťte se o několik kroků zpět, historie si pamatuje až 80 kroků, u velkých fotek méně.",
        },
        {
          h2: "Filtr jen na část fotky",
          p: "Pokud existuje výběr, filtr se použije jen uvnitř něj. Rozmažte tak pozadí filtrem Jemné rozostření, zatímco postava zůstane ostrá, nebo pixelizujte jen displej telefonu na fotce. Výběr vytvoříte nástroji Obdélníkový výběr, Eliptický výběr, Laso nebo Kouzelná hůlka a výběr můžete i invertovat, když je snazší označit to, co se měnit nemá. Nastavte výběru prolnutí okraje, aby filtr do okolí přecházel plynule a nevznikla viditelná hrana.",
        },
      ],
      faq: [
        {
          q: "Jak funguje filtr Duotón?",
          a: "Duotón rozloží tóny fotky mezi dvě barvy – hlavní a vedlejší barvu z panelu Barva. Než na filtr kliknete, nastavte si například tmavě modrou a meruňkovou a vznikne výrazný plakátový vzhled. Miniatura v panelu Filtry ukáže výsledek s aktuálními barvami.",
        },
        {
          q: "Dá se síla filtru nastavit?",
          a: "Filtry jsou jednokrokové a vlastní posuvník síly nemají. Pokud je efekt příliš silný, duplikujte vrstvu, filtr použijte na kopii a v panelu Vrstvy jí snižte krytí – efekt tím plynule zeslabíte. Plynulé úpravy s posuvníky nabízí panel Korekce.",
        },
        {
          q: "Uloží se filtr do fotky natrvalo?",
          a: "Do exportovaného souboru ano, filtr se zapíše do pixelů. Originál na disku zůstane nedotčený, protože editor stahuje novou kopii. Chcete-li se k úpravám vrátit, uložte si práci také jako projekt <code>.paint</code>, který zachová vrstvy.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "brighten-photo": {
      title: "Zesvětlit fotku online – jas a kontrast",
      description:
        "Zesvětlete tmavou fotku a vyrovnejte barvy: expozice, stíny, kontrast, teplota a další posuvníky s živým náhledem, Úrovně i Křivky. Zdarma a bez nahrávání.",
      h1: "Zesvětlit tmavou fotku",
      lead:
        "Panel Korekce nabízí 15 posuvníků s živým náhledem, od expozice po vinětaci. Tmavou fotku z oslavy nebo snímek proti světlu vytáhnete během pár vteřin.",
      card: "Zesvětlit fotku",
      cardText: "Expozice, stíny, kontrast, Úrovně a Křivky",
      steps: [
        "Přetáhněte tmavou fotku sem.",
        "V panelu Korekce posuňte expozici nebo stíny, případně zkuste automatické úrovně.",
        "Změny potvrďte tlačítkem Použít a fotku exportujte.",
      ],
      sections: [
        {
          h2: "Kterým posuvníkem začít",
          p: "Je-li tmavá celá fotka, začněte expozicí – zesvětlí obraz rovnoměrně, podobně jako delší čas závěrky. Pokud je obloha v pořádku a tmavé jsou jen obličeje ve stínu, nechte expozici být a zvedněte stíny. Přepálenou oblohu naopak zachráníte stažením světel. Jas posouvá celý obraz a snadno ho zplošťuje, proto ho používejte opatrně a doplňte ho kontrastem. Gama zesvětlí hlavně střední tóny a zachová černou i bílou.",
        },
        {
          h2: "Úrovně a Křivky pro přesnou práci",
          p: "Automatické úrovně v liště roztáhnou tóny fotky tak, aby nejtmavší místo bylo černé a nejsvětlejší bílé – u zašedlých a mdlých snímků je to nejrychlejší oprava. Dialog Úrovně… ukazuje histogram: posuňte bílý bod k místu, kde histogram končí, a fotka se zesvětlí bez přepalů. V dialogu Křivky… taháte body na tónové křivce, zvednutím středu zesvětlíte střední tóny. Obojí funguje i pro jednotlivé kanály RGB, což pomůže odstranit barevný nádech.",
        },
        {
          h2: "Barvy, teplota a rychlé předvolby",
          p: "Fotky pod žárovkou bývají žluté, ve stínu za zataženého dne zase modré. Posuvník Teplota to vyrovná, zelený nebo purpurový nádech od zářivek dorovná posuvník Nádech. Sytost posílí všechny barvy, živost hlavně ty méně syté, takže pleť nezoranžoví. V nabídce Korekce najdete i rychlé předvolby Automatický kontrast, Oteplit, Ochladit a Výrazné barvy – dobrý výchozí bod, který pak doladíte posuvníky. Všechny změny vidíte živě ještě před potvrzením.",
        },
      ],
      faq: [
        {
          q: "Jak zesvětlit tmavou fotku, aby nebyla šedivá?",
          a: "Místo jasu použijte expozici nebo stíny a pak mírně přidejte kontrast. Jas posouvá i černou, takže fotka vybledne. Pomoci může i dialog Úrovně…, kde bílý bod přisunete k pravému okraji histogramu a černá zůstane černá.",
        },
        {
          q: "Jak zesvětlit jen část fotky?",
          a: "Označte oblast některým nástrojem výběru, nejlépe s prolnutím okraje, a korekce se použijí jen uvnitř. Pro jemné malování světla je tu nástroj Zesvětlit / ztmavit: přejíždějte jím po místě, které chcete rozjasnit, a zvolte, zda má působit na stíny, střední tóny, nebo světla.",
        },
        {
          q: "Zachráním úplně černou nebo přepálenou fotku?",
          a: "Jen částečně. Ze stínů lze vytáhnout detail, který fotoaparát zaznamenal, ale do úplně černých nebo bílých míst editor informaci nepřidá. Zesvětlení tmavých míst navíc zvýrazní šum. Formát RAW, který by dal víc rezervy, editor neotevírá.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "make-background-transparent": {
      title: "Průhledné pozadí obrázku – PNG online",
      description:
        "Udělejte obrázku průhledné pozadí: nástrojem Kouzelná hůlka označte pozadí, smažte ho a uložte PNG. Hodí se pro loga, podpisy i produkty na bílém. Zdarma.",
      h1: "Průhledné pozadí obrázku",
      lead:
        "Klikněte nástrojem Kouzelná hůlka do pozadí, stiskněte <kbd>Delete</kbd> a místo něj se objeví šachovnice průhlednosti. Nejlépe to funguje u jednobarevného pozadí, jaké mívají loga, podpisy nebo produktové fotky na bílém.",
      card: "Průhledné pozadí",
      cardText: "Odstranění jednobarevného pozadí a export do PNG",
      steps: [
        "Přetáhněte obrázek s jednobarevným pozadím sem.",
        "Nástrojem Kouzelná hůlka klikněte do pozadí a stiskněte <kbd>Delete</kbd>.",
        "Klikněte na Exportovat a uložte obrázek jako PNG nebo WebP.",
      ],
      sections: [
        {
          h2: "Jak odstranit pozadí nástrojem Kouzelná hůlka",
          p: "Kouzelná hůlka vybere souvislou oblast podobné barvy. Klikněte do pozadí; pokud výběr zasahuje do objektu, snižte toleranci, a když kolem objektu zůstávají zbytky, toleranci zvyšte. Kliknutím se stisknutou klávesou <kbd>Shift</kbd> přidáte další místo, třeba pozadí uvnitř písmene O, s klávesou <kbd>Alt</kbd> naopak část z výběru uberete. Pak stiskněte <kbd>Delete</kbd> nebo tlačítko v liště a pozadí zmizí. Zbylé drobnosti dočistíte nástrojem Guma.",
        },
        {
          h2: "Čisté okraje s maskou vrstvy",
          p: "Mazání je destruktivní: smazané pixely vrátíte jen krokem zpět. Šetrnější cestou je maska vrstvy, na které pozadí místo smazání jen skryjete. Malováním černou barvou na masku skrýváte, bílou zase odkrýváte, takže přehnaný zásah do okraje produktu nebo do vlasů snadno opravíte. Masku přidáte v nabídce Vrstva, a to i rovnou z výběru. Až budete spokojení, masku použijte, nebo ji ponechte – export uloží to, co vidíte na plátně.",
        },
        {
          h2: "Formát, oříznutí a co nečekat",
          p: "Průhlednost uloží jen PNG a WebP, JPEG by prázdná místa vyplnil bílou. Před uložením použijte v nabídce Obrázek příkaz Oříznout průhledné okraje – plátno se zmenší přesně na objekt, což se hodí u log a podpisů vkládaných do dokumentů. Editor nemá umělou inteligenci, která by sama rozpoznala osobu nebo zvíře. U portrétu na pestrém pozadí proto počítejte s ruční prací s nástrojem Laso a maskou vrstvy.",
        },
      ],
      faq: [
        {
          q: "Jak udělat průhledné pozadí u loga?",
          a: "Otevřete logo, klikněte nástrojem Kouzelná hůlka do pozadí a stiskněte <kbd>Delete</kbd>. Nezapomeňte na uzavřené plochy uvnitř písmen, ty přidáte kliknutím se stisknutou klávesou <kbd>Shift</kbd>. Nakonec použijte Oříznout průhledné okraje a logo exportujte jako PNG.",
        },
        {
          q: "Proč má uložený obrázek zase bílé pozadí?",
          a: "Nejspíš jste ho uložili jako JPEG, který průhlednost nepodporuje a vyplní ji bílou. V dialogu „Exportovat obrázek“ zvolte PNG nebo WebP. Šachovnice v editoru jen znázorňuje průhlednost, do souboru se neukládá.",
        },
        {
          q: "Jak odstranit pozadí z fotky člověka?",
          a: "Automatické vystřižení postavy editor neumí, funkce umělé inteligence nemá. Postavu můžete obtáhnout nástrojem Laso, výběr invertovat a pozadí smazat, nebo ho skrýt maskou vrstvy a okraje dočistit štětcem. U vlasů je to práce na delší dobu, u jednoduchých tvarů je zvládnutelná rychle.",
        },
        {
          q: "Jak vytvořit podpis s průhledným pozadím?",
          a: "Podepište se černě na bílý papír, vyfoťte ho za dobrého světla a otevřete zde. Nástrojem Kouzelná hůlka s vyšší tolerancí klikněte do bílé plochy, smažte ji a ořízněte průhledné okraje. Podpis se přitom nikam neodesílá a uložený PNG vložíte do dokumentu.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "color-picker-from-image": {
      title: "Zjistit barvu z obrázku – HEX a RGB",
      description:
        "Zjistěte barvu z obrázku nebo fotky: klikněte kamkoli a uvidíte kód HEX i hodnoty RGB. Kód HEX zkopírujete jedním kliknutím. Hodí se pro web i grafiku.",
      h1: "Zjistit barvu z obrázku",
      lead:
        "Klikněte nástrojem Kapátko kamkoli do obrázku a hned uvidíte kód barvy ve formátu HEX i hodnoty RGB. Tlačítkem Kopírovat HEX přenesete kód do CSS, prezentace nebo jiného programu.",
      card: "Barva z obrázku",
      cardText: "Kód HEX a RGB z libovolného pixelu",
      steps: [
        "Přetáhněte obrázek nebo snímek obrazovky sem.",
        "Nástrojem Kapátko klikněte nebo táhněte po místě s hledanou barvou.",
        "Kód HEX zkopírujte tlačítkem Kopírovat HEX v liště.",
      ],
      sections: [
        {
          h2: "HEX, nebo RGB?",
          p: "Lišta nástroje Kapátko ukáže vybranou barvu ve dvou zápisech. <strong>HEX</strong>, třeba <code>#1E88E5</code>, je šestimístný kód, který se používá v CSS, webových editorech, prezentacích i v manuálech firemní identity. <strong>RGB</strong>, například <code>30, 136, 229</code>, udává podíl červené, zelené a modré složky v rozsahu 0–255 a hodí se pro programy, které chtějí jednotlivé složky zvlášť. Oba zápisy popisují stejnou barvu. Tlačítko Kopírovat HEX vloží do schránky kód HEX, hodnoty RGB si z lišty opíšete.",
        },
        {
          h2: "Jak trefit přesný pixel",
          p: "Fotky jsou plné šumu a přechodů, takže dva sousední pixely mívají trochu jiný odstín. Přibližte si obraz kolečkem myši nebo roztažením prstů – zoom jde až na 3200 %, kdy je každý pixel velký čtverec. Když nástrojem Kapátko táhnete po obrázku, kód se průběžně mění a vy ho pustíte na místě, které nejlépe odpovídá barvě, jakou vidíte. U loga a grafiky s plnými plochami je výsledek přesný na první kliknutí.",
        },
        {
          h2: "Všechny vrstvy, nebo jen aktivní, a paleta barev",
          p: "Kapátko umí brát barvu z výsledného obrazu všech vrstev, nebo jen z aktivní vrstvy – volbu najdete v jeho liště. Vybraná barva se zobrazí i v panelu Barva, takže s ní můžete hned malovat, psát text nebo vyplňovat plochy. Nasáté barvy se ukládají do řady Nedávné, a tak si z jedné fotky snadno poskládáte celou paletu, třeba pro web, pozvánku nebo prezentaci v barvách fotky.",
        },
      ],
      faq: [
        {
          q: "Jak zjistit kód barvy z obrázku?",
          a: "Otevřete obrázek na této stránce a editor rovnou zapne Kapátko. Klikněte na místo s hledanou barvou a v liště se zobrazí kód HEX i hodnoty RGB. Tlačítkem Kopírovat HEX vložíte kód do schránky a odtud kamkoli dál.",
        },
        {
          q: "Můžu zjistit barvu z webové stránky?",
          a: "Ano, přes snímek obrazovky. Ve Windows ho do schránky uložíte klávesami <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>, na Macu <kbd>⌘</kbd>+<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>4</kbd>. Pak ho sem vložte klávesami <kbd>Ctrl</kbd>+<kbd>V</kbd> (na Macu <kbd>⌘</kbd>+<kbd>V</kbd>) a nástrojem Kapátko klikněte na požadovanou barvu.",
        },
        {
          q: "Proč se kód barvy liší od originálu?",
          a: "Fotka v JPEG obsahuje kompresní šum a přechody, takže stejná plocha má mírně odlišné pixely. Editor navíc nepracuje se správou barev, takže barvy z fotek s barevným profilem nemusí přesně sedět. Pro přesnou firemní barvu vycházejte z originálního podkladu, ne z fotky.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "draw-on-image": {
      title: "Kreslení do fotky a obrázku online",
      description:
        "Kreslete do fotky nebo snímku obrazovky štětcem, šipkami a tvary. Označte místo na mapě, zvýrazněte text nebo popište návod. Zdarma, bez registrace a nahrávání.",
      h1: "Kreslení do fotky online",
      lead:
        "Fotka se otevře s připraveným nástrojem Štětec, takže můžete hned kreslit. Pro přehledné poznámky jsou tu i nástroje Šipka, Obdélník, Elipsa a další tvary.",
      card: "Kreslení do fotky",
      cardText: "Štětec, šipky a tvary pro poznámky a nákresy",
      steps: [
        "Přetáhněte fotku nebo snímek obrazovky sem.",
        "V panelu Vrstvy přidejte novou vrstvu pro kresbu.",
        "Kreslete nástrojem Štětec, doplňte šipky a tvary a obrázek exportujte.",
      ],
      sections: [
        {
          h2: "Šipky a rámečky pro návody a reklamace",
          p: "Snímek obrazovky s červenou šipkou vysvětlí víc než odstavec textu. Nástroj Šipka nakreslí rovnou šipku tažením, Obdélník se zaoblenými rohy nebo Elipsa zarámují tlačítko v aplikaci, chybu v dokumentu nebo poškození na fotce zboží pro reklamaci. Obdélník i Elipsu můžete kreslit obrysem, výplní, nebo obojím. Na rovné spojnice a kóty použijte nástroj Čára. Mnohoúhelník a Hvězda nakreslí do rámečku, který natáhnete, tvar se 3 až 16 stranami nebo cípy. Barvu všech nástrojů nastavíte v panelu Barva.",
        },
        {
          h2: "Zvýrazňovač a ruční poznámky",
          p: "Štětec s nastavitelnou velikostí, tvrdostí a vyhlazením tahu se hodí na ručně psané poznámky, podpisy i zakroužkování místa na mapě nebo plánku bytu. Efekt zvýrazňovače vytvoříte tak, že na novou vrstvu malujete žlutou barvou a vrstvě nastavíte režim prolnutí Násobit a nižší krytí – text pod ní zůstane čitelný. Tužka kreslí ostré pixelové čáry, Sprej měkké stopy. Na tabletu s perem reaguje štětec na přítlak.",
        },
        {
          h2: "Proč kreslit na samostatnou vrstvu",
          p: "Když kreslíte rovnou do fotky, každý tah se smíchá s pixely obrázku. Na samostatné vrstvě zůstane kresba oddělená: nepovedenou šipku smažete nástrojem Guma, aniž byste poškodili fotku, a celou vrstvu můžete skrýt, posunout nástrojem Přesun nebo jí snížit krytí. Vrstev si přidejte, kolik potřebujete, třeba jednu na šipky a druhou na text. Při exportu do JPEG nebo PNG se vše sloučí do jednoho obrázku, projekt <code>.paint</code> vrstvy zachová.",
        },
      ],
      faq: [
        {
          q: "Jak nakreslit šipku do obrázku?",
          a: "Vyberte nástroj Šipka a v panelu Barva nastavte barvu, třeba červenou. Pak táhněte od místa, kde má šipka začínat, k místu, na které má ukazovat. Nepovedenou šipku vrátíte klávesami <kbd>Ctrl</kbd>+<kbd>Z</kbd> a nakreslíte znovu.",
        },
        {
          q: "Jak zakrýt část snímku obrazovky?",
          a: "Nástrojem Obdélník s plnou výplní nakreslete přes údaj neprůhledný obdélník. Po exportu do JPEG nebo PNG pod ním nic nepřečtete. Pozor na PSD a projekt <code>.paint</code>: tam by obdélník zůstal na samostatné vrstvě a šel by odstranit. Alternativou je rozmazání vybrané oblasti.",
        },
        {
          q: "Funguje kreslení prstem na telefonu?",
          a: "Ano, plátno reaguje na dotyk i stylus. Jedním prstem kreslíte, roztažením dvou prstů obraz přiblížíte, což se hodí pro přesnější tahy. S perem na tabletu se navíc tloušťka čáry mění podle přítlaku.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "paint-online": {
      title: "Malování a kreslení online zdarma",
      description:
        "Malování online zdarma na prázdném plátně: štětce s přítlakem pera, vrstvy, výplň, přechody, tvary a text. Funguje na počítači, tabletu i Chromebooku.",
      h1: "Malování online na prázdném plátně",
      lead:
        "Nepotřebujete žádný soubor: jedním tlačítkem otevřete bílé plátno 1600 × 1000 px s připraveným nástrojem Štětec a můžete začít. Rozpracovaný obrázek se průběžně ukládá v prohlížeči.",
      card: "Malování online",
      cardText: "Prázdné plátno, štětce s přítlakem a vrstvy",
      steps: [
        "Klikněte na Začít s prázdným plátnem.",
        "V panelu Barva vyberte barvu a malujte nástrojem Štětec.",
        "Hotový obrázek uložte přes Exportovat, nebo jako projekt <code>.paint</code>.",
      ],
      sections: [
        {
          h2: "Štětce, které reagují na pero",
          p: "Štětec má nastavitelnou velikost, krytí, tvrdost a vyhlazení, které uhladí roztřesené tahy myší. S grafickým tabletem, stylusem nebo Apple Pencil mění v prohlížeči tloušťku podle přítlaku, takže tah se zužuje a rozšiřuje jako u skutečného štětce. Tužka kreslí tvrdé pixelové čáry vhodné pro pixel art, Sprej měkce rozprašuje barvu a Guma maže. Velké plochy vybarvíte nástrojem Výplň, plynulou oblohu nebo pozadí nástrojem Přechod, lineárním nebo kruhovým.",
        },
        {
          h2: "Vrstvy pro skicu, linku a barvy",
          p: "Kresbu si rozdělte do vrstev: na jednu skicu, na další čistou linku a pod ni barvy. Skicu pak skryjete nebo jí snížíte krytí a barvy opravujete, aniž byste poškodili obrys. Vrstev může být libovolně mnoho a 17 režimů prolnutí pomůže se stíny a světly. Přiblížení až na 3200 % umožní dokreslit detaily, historie vrátí až 80 kroků (u velmi velkých pláten méně). K dispozici jsou i tvary a nástroj Text, třeba pro komiksové bubliny nebo přání k narozeninám.",
        },
        {
          h2: "Pro děti i dospělé, na čemkoli s prohlížečem",
          p: "Malování a kreslení online funguje bez instalace na počítači, školním Chromebooku, tabletu i telefonu. Nevyžaduje účet ani e-mail a nezobrazuje reklamy, takže ho můžete bez obav pustit i dětem. Rozpracovaný obrázek se automaticky ukládá do úložiště prohlížeče a při další návštěvě vám ho editor nabídne k obnovení. Hotové dílo uložíte jako PNG, JPEG nebo WebP, s vrstvami jako PSD, nebo jako projekt <code>.paint</code> pro pozdější pokračování.",
        },
      ],
      faq: [
        {
          q: "Je malování vhodné pro děti?",
          a: "Ano. Nevyžaduje registraci, neobsahuje reklamy ani nákupy a nic se nikam neodesílá. Rozhraní je v češtině a pro začátek stačí Štětec, Výplň a Guma. Rozpracovaný obrázek je ale uložený jen v prohlížeči a po vymazání jeho dat zmizí, proto hotové kresby exportujte.",
        },
        {
          q: "Můžu kreslit perem na tabletu nebo iPadu?",
          a: "Ano. Štětec v prohlížeči reaguje na přítlak pera, ať jde o grafický tablet připojený k počítači, nebo Apple Pencil na iPadu. Plátno přiblížíte roztažením dvou prstů. Citlivost na přítlak funguje tam, kde ji prohlížeč a zařízení předávají.",
        },
        {
          q: "Jak změnit velikost plátna?",
          a: "Výchozí plátno má 1600 × 1000 px. Rozměry změníte v nabídce Obrázek přes Velikost plátna…, kde ukotvením zvolíte i to, kde zůstane stávající kresba. Dokument může mít nejvýš 8000 × 8000 px, v Safari na iPhonu a iPadu zhruba 16,7 megapixelu.",
        },
        {
          q: "Kde najdu obrázek, když zavřu okno?",
          a: "Editor průběžně ukládá práci do úložiště prohlížeče a při další návštěvě ve stejném prohlížeči vám ji nabídne k obnovení. Velmi velké dokumenty, jejichž vrstvy mají dohromady přes 192 megapixelů, se ale automaticky neukládají. Na jiném zařízení práci mít nebudete – pro přenos nebo zálohu uložte projekt <code>.paint</code> přes nabídku Soubor.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "open-psd-online": {
      title: "Otevřít PSD online bez Photoshopu",
      description:
        "Otevřete soubor PSD v prohlížeči i bez Photoshopu. Načte vrstvy, krytí, masky i režimy prolnutí a uloží do PNG, JPG nebo zpět do PSD. Zdarma, bez nahrávání.",
      h1: "Otevřít PSD online",
      lead:
        "Dostali jste soubor .psd a nemáte Photoshop? Přetáhněte ho sem – editor ho otevře i s vrstvami, takže ho můžete prohlédnout, upravit a uložit jako obrázek.",
      card: "Otevřít PSD",
      cardText: "Soubory z Photoshopu s vrstvami, bez instalace",
      steps: [
        "Přetáhněte soubor PSD sem, nebo ho vyberte z disku.",
        "V panelu Vrstvy zkontrolujte, skryjte nebo upravte vrstvy.",
        "Klikněte na Exportovat a uložte PNG, JPG nebo vrstvené PSD.",
      ],
      sections: [
        {
          h2: "Co se z PSD načte",
          p: "Editor otevře soubory PSD v režimu RGB nebo ve stupních šedi s 8, 16 i 32 bity na kanál, včetně 16bitových a 32bitových vrstev a kanálů komprimovaných metodou ZIP. Načte pixelové vrstvy s jejich názvy, krytím, viditelností, režimy prolnutí a maskami vrstev; 16bitový a 32bitový dokument při otevření převede na 8 bitů na kanál. Ořezové masky se promítnou přímo do pixelů ořezaných vrstev a krytí výplně se započítá do krytí vrstvy, takže vrstvy vypadají stejně jako ve Photoshopu. Skupiny se rozbalí do obyčejného seznamu vrstev. Textové vrstvy, tvary a inteligentní objekty se načtou tak, jak byly vykreslené, tedy jako pixely – text uvidíte, ale už ho nepřepíšete.",
        },
        {
          h2: "Co se nepřenese",
          p: "Vrstvy úprav (například křivky nebo odstín a sytost z Photoshopu) a efekty vrstev, jako je stín, tah nebo vnější záře, se nepoužijí, takže výsledek může vypadat jinak než v původním programu. 16bitové i 32bitové soubory (HDR) se otevřou s vrstvami převedenými na 8 bitů na kanál; když vrstvy z nějakého důvodu přečíst nejde, editor otevře aspoň sloučený obraz. Formát PSB pro velké dokumenty ani barevné režimy CMYK, Lab, Indexované barvy, Bitová mapa a Duplex editor nepodporuje, tiskové PSD v CMYK proto nejdřív převeďte do RGB.",
        },
        {
          h2: "Úprava a export do PNG nebo JPG",
          p: "Otevřené PSD upravíte jako jakýkoli jiný dokument: skryjete nepotřebnou vrstvu, přidáte nový text nástrojem Text, oříznete plátno nebo upravíte barvy v panelu Korekce. Pro web nebo klienta exportujte PNG či JPEG, pro další práci v grafickém programu uložte vrstvené PSD. Soubor se otevírá přímo ve vašem zařízení, takže nečekáte na nahrání velkého souboru na server a podklady od klienta zůstanou důvěrné.",
        },
      ],
      faq: [
        {
          q: "Jak otevřít PSD bez Photoshopu?",
          a: "Přetáhněte soubor .psd na tuto stránku, nebo ho vyberte z disku. Editor běží v prohlížeči, takže nic neinstalujete a nepotřebujete licenci. Vrstvy se zobrazí v panelu Vrstvy a obrázek můžete hned exportovat do PNG nebo JPEG.",
        },
        {
          q: "Zůstanou vrstvy upravitelné?",
          a: "Pixelové vrstvy ano – můžete je skrývat, přesouvat, měnit jim krytí a režim prolnutí nebo do nich malovat. Textové vrstvy a inteligentní objekty ale přijdou jako pixely, takže text z PSD už nepřepíšete. Nový text přidáte nástrojem Text.",
        },
        {
          q: "Proč PSD vypadá jinak než ve Photoshopu?",
          a: "Nejčastěji kvůli vrstvám úprav a efektům vrstev, které editor nepoužije – chybí pak třeba barevné tónování, stíny nebo obrysy. Rozdíl může způsobit i správa barev, se kterou editor nepracuje. Pokud potřebujete přesný vzhled, požádejte autora o export do PNG.",
        },
        {
          q: "Můžu práci uložit zpátky do PSD?",
          a: "Ano. Při exportu zvolte formát PSD a soubor se uloží s vrstvami, takže ho otevřete i v jiných grafických programech. Pro pokračování přímo v tomto editoru můžete práci uložit také jako projekt <code>.paint</code>.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "retouch-photo": {
      title: "Retuš fotek online – odstranění vad",
      description:
        "Retuš fotek online zdarma: bodovou retuší odstraníte pupínek, prach nebo drát, razítkem zkopírujete texturu a zesvětlením oživíte oči. Bez nahrávání.",
      h1: "Retuš fotek online",
      lead:
        "Editor se otevře s nástrojem Bodová retuš: přetřete pupínek, smítko nebo tenký drát a po puštění se místo vyplní strukturou z okolí. Na náročnější opravy jsou připravené Retušovací štětec a Razítko.",
      card: "Retuš fotky",
      cardText: "Odstranění pupínků, prachu a drobných rušivých prvků",
      steps: [
        "Přetáhněte fotku sem a přibližte si místo, které chcete opravit.",
        "Nástrojem Bodová retuš přetřete vadu, velikost štětce zvolte o kousek větší.",
        "Výsledek zkontrolujte při 100% přiblížení a fotku exportujte.",
      ],
      sections: [
        {
          h2: "Bodová retuš, Retušovací štětec, nebo Razítko?",
          p: "Bodová retuš je nejrychlejší: nic nenastavujete, jen přetřete vadu a editor po puštění tlačítka doplní texturu z okolí. Hodí se na pupínky, prach ze senzoru, ptáka na obloze nebo dráty. Retušovací štětec použijte tam, kde chcete zdroj určit sami: se stisknutou klávesou <kbd>Alt</kbd> klikněte na čisté místo a malujte – textura se zkopíruje, ale barva a jas se přizpůsobí cíli, takže na pleti nevzniknou fleky. Razítko kopíruje přesně, hodí se na opakující se vzory.",
        },
        {
          h2: "Zesvětlení, ztmavení a jemné doladění",
          p: "Nástroj Zesvětlit / ztmavit funguje jako štětec, kterým přidáváte nebo ubíráte světlo. Zesvětlením oživíte oči a zuby, ztmavením zvýrazníte obočí nebo stáhnete lesklé místo na čele. Rozsah nastavíte na stíny, střední tóny nebo světla, aby nástroj působil jen tam, kde má. Nástroj Rozmazání zjemní pleť nebo nežádoucí detaily, Zaostření naopak vytáhne kresbu v očích či řasách a Rozmazání prstem posune pixely, třeba při úpravě odstávajících vlasů.",
        },
        {
          h2: "Tipy a meze retuše",
          p: "Pracujte krátkými tahy a raději víckrát než jedním dlouhým přes půl fotky. Velikost štětce volte jen o kousek větší než vada. Výsledek kontrolujte při 100% přiblížení a občas i při oddálení, protože opakující se vzor po Razítku je vidět až z odstupu. Nástroje nejlépe fungují na malých plochách s jednoduchým okolím. Odstranit velkou postavu z rušné ulice půjde jen trpělivým klonováním, protože editor nemá generativní výplň s umělou inteligencí. Portréty přitom zůstávají ve vašem zařízení.",
        },
      ],
      faq: [
        {
          q: "Jak odstranit pupínek z fotky?",
          a: "Přibližte si obličej, vyberte nástroj Bodová retuš s velikostí o kousek větší, než je pupínek, a jedním krátkým tahem ho přetřete. Po puštění se místo vyplní okolní pletí. Pokud výsledek nesedí, vraťte krok zpět a zkuste tah z jiného směru.",
        },
        {
          q: "Jak odstranit z fotky drát nebo předmět?",
          a: "Tenké dráty, sloupy na obloze nebo smetí na trávníku zvládne Bodová retuš, stačí po nich přejet jedním tahem. U větších předmětů pracujte po částech a kombinujte ji s nástrojem Razítko, kterým zkopírujete vhodnou plochu z okolí. Velké objekty ve složité scéně chtějí trpělivost.",
        },
        {
          q: "Je retuš nevratná?",
          a: "V editoru ne, historie vrátí až 80 kroků (u velkých fotek méně, protože ji omezuje i paměť). Pro větší jistotu si před retuší v panelu Vrstvy duplikujte vrstvu a pracujte na kopii. Originál pod ní pak můžete kdykoli zobrazit a porovnat s výsledkem.",
        },
        {
          q: "Proč retuš na fotce vytváří šmouhy?",
          a: "Nejčastěji je štětec příliš velký nebo tah vede přes hranu, třeba z pleti do vlasů. Okolí pak obsahuje dvě různé struktury a nástroj je smíchá. Zmenšete štětec, pracujte kratšími tahy podél hrany a u nástroje Retušovací štětec vyberte zdroj se stejnou strukturou.",
        },
      ],
    },
  },
};
