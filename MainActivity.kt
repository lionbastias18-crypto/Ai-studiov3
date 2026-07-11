package com.example.sampleapp

import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast

class MainActivity : AppCompatActivity() {
    private var clickCount = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val welcomeText = findViewById<TextView>(R.id.welcomeText)
        val clickButton = findViewById<Button>(R.id.clickButton)
        val countText = findViewById<TextView>(R.id.countText)

        clickButton.setOnClickListener {
            clickCount++
            countText.text = "Button clicked $clickCount times"
            
            if (clickCount % 5 == 0) {
                Toast.makeText(this, "Wow! You've clicked $clickCount times!", Toast.LENGTH_SHORT).show()
            }
        }
    }
}