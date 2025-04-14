function dialogWithUser() {
    const mood = prompt("Який настрій ви хочете створити в інтер’єрі?\n(Наприклад: спокій, енергія, затишок, розкіш, творчість)");

    if (!mood) {
        alert("Добре! Можете переглядати розділи сайту для натхнення.");
        return;
    }

    let recommendation = "";

    switch (mood.toLowerCase()) {
        case "спокій":
            recommendation = "Скандинавський або мінімалістичний стиль ідеально підійдуть.";
            break;
        case "енергія":
            recommendation = "Спробуйте лофт або модерн — вони наповнені динамікою!";
            break;
        case "затишок":
            recommendation = "Прованс, бохо або кантрі — саме те, що потрібно.";
            break;
        case "розкіш":
            recommendation = "Класичний або арт-деко стиль підкреслять елегантність.";
            break;
        case "творчість":
            recommendation = "Еклектика або середземноморський стиль дадуть простір уяві.";
            break;
        default:
            recommendation = "Перегляньте всі стилі — щось точно вас зацікавить!";
    }

    alert("Рекомендація: " + recommendation);
}