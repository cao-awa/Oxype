plugins {
    kotlin("jvm") version "2.4.0"
}

group = "top.lipiston"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()
    maven {
        setUrl("https://jitpack.io")
    }
}

dependencies {
    implementation("com.github.cao-awa:Kalmia:1.0.34")
    implementation("com.github.cao-awa:Kalmia-rocksdb:1.0.9")
    implementation("com.github.cao-awa:cason:1.0.35")
    implementation("org.rocksdb:rocksdbjni:10.10.1.1")
    implementation("com.github.ben-manes.caffeine:caffeine:3.1.8")

    testImplementation(kotlin("test"))
}

kotlin {
    jvmToolchain(21)
}

tasks.test {
    useJUnitPlatform()
}