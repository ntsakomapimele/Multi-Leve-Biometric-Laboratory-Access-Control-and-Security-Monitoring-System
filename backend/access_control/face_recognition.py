import base64
import binascii

import cv2
import numpy as np


FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)
CONFIDENCE_THRESHOLD = 75


def decode_image(data):
    if not data:
        raise ValueError("A face image is required.")
    try:
        raw = data.split(",", 1)[1] if "," in data else data
        image = cv2.imdecode(np.frombuffer(base64.b64decode(raw), np.uint8), cv2.IMREAD_GRAYSCALE)
    except (ValueError, binascii.Error):
        image = None
    if image is None:
        raise ValueError("The face image could not be decoded.")
    return image


def extract_face(data):
    image = decode_image(data)
    faces = FACE_CASCADE.detectMultiScale(image, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    if len(faces) != 1:
        raise ValueError("The image must contain exactly one clearly visible face.")
    x, y, width, height = faces[0]
    return cv2.resize(image[y : y + height, x : x + width], (200, 200))


def matches_sample(face, samples):
    if not samples:
        return False
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.train(samples, np.ones(len(samples), dtype=np.int32))
    _, confidence = recognizer.predict(face)
    return confidence <= CONFIDENCE_THRESHOLD