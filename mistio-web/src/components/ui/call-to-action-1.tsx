import React from 'react';
import { Mail, Building2, Phone } from 'lucide-react';

export function CallToActionOne() {
  return (
    <div className="max-w-5xl py-16 md:w-full mx-2 md:mx-auto flex flex-col items-center justify-center text-center bg-gradient-to-b from-[#5524B7] to-[#380B60] rounded-2xl p-10 text-white">
      <div className="flex flex-wrap items-center justify-center p-1 rounded-full bg-purple-600/10 backdrop-blur border border-purple-500/40 text-sm">
        <div className="flex items-center">
          <img
            className="size-6 md:size-7 rounded-full border-3 border-white"
            src="https://images.unsplash.com/photo-1633332755192-727a05c4013d?q=80&w=50"
            alt="userImage1"
          />
          <img
            className="size-6 md:size-7 rounded-full border-3 border-white -translate-x-2"
            src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=50"
            alt="userImage2"
          />
          <img
            className="size-6 md:size-7 rounded-full border-3 border-white -translate-x-4"
            src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=50&h=50&auto=format&fit=crop"
            alt="userImage3"
          />
        </div>
        <p className="-translate-x-2 font-medium">Join community of 1m+ founders</p>
      </div>
      <h1 className="text-4xl md:text-5xl md:leading-[60px] font-semibold max-w-xl mt-5 bg-gradient-to-r from-white to-[#CAABFF] text-transparent bg-clip-text">
        Unlock your next big opportunity.
      </h1>
      <button className="px-8 py-3 text-white bg-violet-600 hover:bg-violet-700 transition-all rounded-full uppercase text-sm mt-8">
        Join Discord
      </button>
    </div>
  );
}

export function ContactDemo() {
  return (
    <div className="max-w-5xl w-full mx-auto p-10 text-gray-800">
      <span className="px-2 py-1 text-xs border border-gray-300 rounded-full">Reach Out To Us</span>
      <h1 className="text-4xl font-bold text-left mt-4">We'd love to Hear From You.</h1>
      <p className="text-left mt-4">
        Or just reach out manually to
        <a href="mailto:contact@example.com" className="text-indigo-600 hover:underline"> contact@example.com</a>
      </p>
      <div className="grid md:grid-cols-3 mt-16 gap-8">
        <div>
          <div className="text-indigo-500 bg-indigo-500/20 p-2.5 aspect-square rounded-full size-10 inline-flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
          <p className="text-lg font-bold mt-2">Email Support</p>
          <p className="text-gray-500 mt-1 mb-4">Our team can respond in real time.</p>
          <a href="mailto:support@example.com" className="text-indigo-600 font-semibold">support@example.com</a>
        </div>
        <div>
          <div className="text-indigo-500 bg-indigo-500/20 p-2.5 aspect-square rounded-full size-10 inline-flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
          <p className="text-lg font-bold mt-2">Visit Our Office</p>
          <p className="text-gray-500 mt-1 mb-4">Visit our location in real life.</p>
          <span className="text-indigo-600 font-semibold">221b Elementary Avenue, NY</span>
        </div>
        <div>
          <div className="text-indigo-500 bg-indigo-500/20 p-2.5 aspect-square rounded-full size-10 inline-flex items-center justify-center">
            <Phone className="w-5 h-5" />
          </div>
          <p className="text-lg font-bold mt-2">Call Us Directly</p>
          <p className="text-gray-500 mt-1 mb-4">Available during working hours.</p>
          <span className="text-indigo-600 font-semibold">(+1) 234 - 4567 - 789</span>
        </div>
      </div>
    </div>
  );
}

