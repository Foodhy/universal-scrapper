"""Ocho problemas generales vistos en reseñas de repartidores. Se pueden editar en el panel."""

DEFAULT_PROBLEMS = [
    {
        "id": "identidad",
        "title": "Verificación de identidad repetida",
        "instructions": "¿El comentario se queja de que piden documentos o verificación de identidad demasiadas veces?",
        "true": "Menciona cédula, documento, selfie, verificación o identidad pedida de nuevo, muy seguido o en cada conexión.",
        "false": "No habla de verificación de identidad ni de documentos.",
    },
    {
        "id": "pagos",
        "title": "Pagos, propinas o tarifas bajas",
        "instructions": "¿El comentario se queja de cuánto pagan, de las propinas o de que la tarifa no alcanza?",
        "true": "Habla de propinas que se caen, tarifas bajas, incentivos que bajaron o de que el esfuerzo paga poco.",
        "false": "No habla de dinero recibido, propinas ni tarifas.",
    },
    {
        "id": "deudas",
        "title": "Deudas o cobros indebidos",
        "instructions": "¿El comentario se queja de una deuda, un cobro o un descuento que considera injusto?",
        "true": "Menciona deuda, cobro, descuento, saldo negativo o que le cargan un pedido cancelado.",
        "false": "No habla de deudas, cobros ni descuentos.",
    },
    {
        "id": "bloqueo",
        "title": "Cuenta bloqueada o suspendida",
        "instructions": "¿El comentario dice que bloquearon, suspendieron o cerraron la cuenta?",
        "true": "Dice que lo bloquearon, suspendieron, desactivaron o cerraron la cuenta, con o sin explicación.",
        "false": "No habla de un bloqueo o suspensión de la cuenta.",
    },
    {
        "id": "soporte",
        "title": "Soporte que no resuelve",
        "instructions": "¿El comentario se queja de que soporte no contesta, no ayuda o no hay a quién acudir?",
        "true": "Menciona soporte, chat, oficinas o que nadie resuelve el caso.",
        "false": "No habla del soporte ni de la falta de ayuda humana.",
    },
    {
        "id": "fallas",
        "title": "Fallas de la app o de una actualización",
        "instructions": "¿El comentario reporta un fallo técnico, un cierre o una actualización que empeoró la app?",
        "true": "Describe crashes, errores, la app que se cierra, ubicación que no actualiza o una versión nueva peor.",
        "false": "No describe un fallo técnico ni una actualización.",
    },
    {
        "id": "pedidos",
        "title": "Pedidos, zonas o esfuerzo que no compensa",
        "instructions": "¿El comentario se queja de cómo llegan los pedidos, de la distancia o de exigencias para mantener la cuenta activa?",
        "true": "Habla de pedidos que no caen, distancias largas, tasas de aceptación o de trabajar mucho para pocos pedidos.",
        "false": "No habla de asignación de pedidos, zonas ni metas de aceptación.",
    },
    {
        "id": "acceso",
        "title": "No puede registrarse o entrar",
        "instructions": "¿El comentario dice que no puede crear la cuenta, entrar o pasar del registro?",
        "true": "No logra registrarse, verificar el acceso o pasar de la pantalla de inicio de sesión.",
        "false": "Entra a la cuenta y el problema es otro.",
    },
]


def validate_problems(problems: list[dict]) -> list[dict]:
    if not isinstance(problems, list) or not problems:
        raise ValueError("Hace falta al menos un problema")
    cleaned = []
    seen = set()
    for item in problems:
        if not isinstance(item, dict):
            raise ValueError("Cada problema tiene que ser un objeto")
        problem_id = str(item.get("id") or "").strip()
        title = str(item.get("title") or "").strip()
        instructions = str(item.get("instructions") or "").strip()
        true_when = str(item.get("true") or "").strip()
        false_when = str(item.get("false") or "").strip()
        if not problem_id or not title or not instructions or not true_when or not false_when:
            raise ValueError(f"Problema incompleto: {problem_id or title or 'sin id'}")
        if problem_id in seen:
            raise ValueError(f"Id de problema repetido: {problem_id}")
        seen.add(problem_id)
        cleaned.append(
            {
                "id": problem_id,
                "title": title,
                "instructions": instructions,
                "true": true_when,
                "false": false_when,
            }
        )
    return cleaned
