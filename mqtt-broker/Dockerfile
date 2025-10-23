FROM eclipse-mosquitto:2.0

# Copy custom configuration
COPY mosquitto.conf /mosquitto/config/mosquitto.conf

# Expose MQTT port
EXPOSE 1883

# Expose WebSocket port (optional, for future web clients)
EXPOSE 9001

CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
